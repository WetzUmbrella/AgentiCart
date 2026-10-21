import { getProduct, productName } from "./catalogue";
import { config } from "./config";
import { HttpError, expired } from "./errors";
import { toCents } from "./money";
import { getPayPal, isUncertain, PayPalError, type Capture, type PayPalApi, type PurchaseUnit } from "./paypal";
import { checkShippedModel as realCheck } from "./ai";
import { getOrder, logEvent, saveOrder } from "./store";
import type { Line, Order, ShipVerdict } from "./types";

/**
 * Every money decision in AgentCart happens in this file, in server code.
 * The AI only ever returns a verdict; it has no way to call PayPal.
 */

export type Deps = {
  paypal: PayPalApi;
  checkShipped: (line: Line, shipped: string) => Promise<ShipVerdict>;
};

const defaultDeps = (): Deps => ({ paypal: getPayPal(), checkShipped: realCheck });

const PLATFORM = "platform";
const MAX_LINES = 8;
const MAX_QTY = 5;

function load(orderId: string): Order {
  const o = getOrder(orderId);
  if (!o) throw expired();
  return o;
}

function lineOf(order: Order, lineId: string): Line {
  const l = order.lines.find((x) => x.line_id === lineId);
  if (!l) throw new HttpError(404, "unknown_line");
  return l;
}

// ---------- "did that charge go through?" (risk R-P3) ----------

export const UNCERTAIN_MESSAGE =
  "PayPal did not confirm this charge. Do not ship yet. It is checked again before the order closes.";

/** Tag on every capture, so a capture whose reply was lost can be found in PayPal's record. */
export const invoiceIdFor = (orderId: string, lineId: string) => `${orderId}-${lineId}`;

const isDuplicateInvoice = (err: unknown) => err instanceof PayPalError && err.issue === "DUPLICATE_INVOICE_ID";

/** Finds our capture in PayPal's order record. null = PayPal has no such capture. */
async function lookupCapture(orderId: string, invoiceId: string, deps: Deps): Promise<Capture | null | "unreachable"> {
  try {
    const o = await deps.paypal.getOrder(orderId);
    const all = o.purchase_units.flatMap((u) => u.payments?.captures ?? []);
    return all.find((c) => c.invoice_id === invoiceId) ?? null;
  } catch {
    return "unreachable";
  }
}

/**
 * Settles every line whose charge is unconfirmed, before close releases anything.
 * Throws (and releases nothing) if PayPal cannot answer, so a hidden charge is never "released".
 */
async function settleUncertain(order: Order, deps: Deps): Promise<void> {
  for (const l of order.lines.filter((x) => x.capture_uncertain)) {
    const found = await lookupCapture(order.orderId, invoiceIdFor(order.orderId, l.line_id), deps);
    if (found === "unreachable") {
      throw new HttpError(503, "paypal_unreachable", {
        message: "Could not confirm a charge with PayPal, so nothing has been released yet. Try Finish again in a minute.",
      });
    }
    if (found?.status === "PENDING") {
      throw new HttpError(409, "payment_pending", {
        message: "PayPal is still processing a charge on this order. Try Finish again later.",
      });
    }
    l.capture_uncertain = undefined;
    if (found?.status === "COMPLETED") {
      l.state = "CAPTURED";
      l.capture_id = found.id;
      l.error = "PayPal confirmed this charge after all. Ship this part.";
      logEvent(order, `LATE_CAPTURE_CONFIRMED ${l.line_id} ${found.id}`);
    } else {
      l.error = "PayPal confirmed this part was never charged. Do not ship.";
      logEvent(order, `CONFIRMED_NOT_CHARGED ${l.line_id}`);
    }
  }
}

// ---------- create ----------

export type NewLine = { line_id: string; product_id: string; qty: number };

export async function createOrder(input: NewLine[], deps: Deps = defaultDeps()): Promise<Order> {
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, "no_lines");
  if (input.length > MAX_LINES) throw new HttpError(400, "too_many_lines", { max: MAX_LINES });
  const ids = new Set<string>();

  const lines: Line[] = input.map((l) => {
    const product = getProduct(l.product_id);
    if (!product) throw new HttpError(400, "unknown_product", { product_id: l.product_id });
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) throw new HttpError(400, "bad_qty", { max: MAX_QTY });
    if (typeof l.line_id !== "string" || !/^line-\d{1,2}$/.test(l.line_id) || ids.has(l.line_id)) {
      throw new HttpError(400, "bad_line_id");
    }
    ids.add(l.line_id);
    return {
      line_id: l.line_id,
      product_id: product.id,
      name: productName(product),
      merchant: product.merchant,
      qty: l.qty,
      // Price always comes from the catalogue, never from the browser.
      amount_cents: toCents(product.price_usd) * l.qty,
      state: "IN_BUNDLE",
    };
  });

  // Single-merchant by default: one purchase unit paid to the platform account.
  // Multi-merchant only if go/no-go test 1 passed (PAYPAL_MULTI_MERCHANT=1).
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const ref = config.multiMerchant ? l.merchant : PLATFORM;
    groups.set(ref, [...(groups.get(ref) ?? []), l]);
  }
  const units: PurchaseUnit[] = [...groups].map(([ref, ls]) => ({
    reference_id: ref,
    payee_email: ref === PLATFORM ? undefined : config.merchantEmail(ref),
    items: ls.map((l) => ({
      name: l.name,
      sku: l.product_id,
      quantity: l.qty,
      unit_cents: l.amount_cents / l.qty,
    })),
  }));
  if (config.multiMerchant && units.some((u) => !u.payee_email)) {
    throw new HttpError(500, "merchant_email_missing", { message: "Set MERCHANT_A/B/C_EMAIL for multi-merchant mode." });
  }

  const created = await deps.paypal.createOrder(units, `order-${crypto.randomUUID()}`);
  const order: Order = { orderId: created.id, status: "CREATED", lines, events: [], created_at: Date.now() };
  logEvent(order, `ORDER_CREATED ${created.id}`);
  saveOrder(order);
  return order;
}

// ---------- authorise ----------

export async function authorizeOrder(orderId: string, deps: Deps = defaultDeps()): Promise<Order> {
  const order = load(orderId);
  if (order.status !== "CREATED") return order; // already done: same answer again
  const res = await deps.paypal.authorizeOrder(orderId, `auth-${orderId}`);
  for (const unit of res.purchase_units ?? []) {
    const auth = unit.payments?.authorizations?.[0];
    const ref = unit.reference_id;
    const unitLines = order.lines.filter((l) => (config.multiMerchant ? l.merchant : PLATFORM) === ref);
    // Only a CREATED authorisation reserves money (review 1.22).
    if (auth && auth.status === "CREATED") {
      for (const l of unitLines) {
        l.auth_id = auth.id;
        l.state = "AUTHORISED";
      }
      logEvent(order, `AUTHORISED ${ref} ${auth.id}`);
    } else {
      for (const l of unitLines) l.error = `Authorisation status ${auth?.status ?? "missing"}`;
      logEvent(order, `AUTHORISATION_NOT_CREATED ${ref} ${auth?.status ?? "missing"}`);
    }
  }
  if (order.lines.some((l) => l.state === "AUTHORISED")) order.status = "AUTHORISED";
  return order;
}

// ---------- ship (the heart of the product) ----------

export type ShipInput = {
  orderId: string;
  line_id: string;
  shipped_model: string;
  tracking_number: string;
  carrier?: string;
};

export type ShipResult = { verdict: ShipVerdict; captured: boolean; capture_id?: string; line: Line };

const TRACKING = /^[A-Za-z0-9-]{1,40}$/;

export async function shipLine(input: ShipInput, deps: Deps = defaultDeps()): Promise<ShipResult> {
  const order = load(input.orderId);
  if (order.status === "CLOSED") throw new HttpError(409, "order_closed");
  const line = lineOf(order, input.line_id);

  // Guard: only an AUTHORISED line can be shipped. Stops double charges and stops a
  // NOT_CHARGED line from being charged later (review 1.2).
  if (line.state !== "AUTHORISED") {
    throw new HttpError(409, "line_not_authorised", { state: line.state, line });
  }
  const tracking = String(input.tracking_number ?? "").trim();
  if (!TRACKING.test(tracking)) throw new HttpError(400, "bad_tracking_number");

  // Claim the line before any await, so a second click hits the guard above.
  line.state = "SHIPPED";
  line.shipped_model = String(input.shipped_model ?? "").slice(0, 64);
  line.error = undefined;
  logEvent(order, `SHIPPED ${line.line_id} "${line.shipped_model}"`);

  let verdict: ShipVerdict;
  try {
    verdict = await deps.checkShipped(line, String(input.shipped_model ?? ""));
  } catch (err) {
    // Nothing was charged, so it is safe to let the merchant try again (review 1.5).
    line.state = "AUTHORISED";
    line.error = "The model check failed. Nothing was charged. Try again.";
    logEvent(order, `CHECK_FAILED ${line.line_id}`);
    throw err instanceof HttpError ? err : new HttpError(502, "check_failed", { message: line.error });
  }
  verdict = { ...verdict, line_id: line.line_id }; // code sets line_id, not the model (review 1.15)
  line.verdict = verdict;

  if (verdict.action !== "CAPTURE") {
    line.state = "NOT_CHARGED";
    logEvent(order, `NOT_CHARGED ${line.line_id}`);
    return { verdict, captured: false, line };
  }

  if (!line.auth_id) {
    line.state = "CAPTURE_FAILED";
    line.error = "No authorisation on this line.";
    return { verdict, captured: false, line };
  }

  const invoiceId = invoiceIdFor(order.orderId, line.line_id);
  let cap: Capture;
  try {
    cap = await deps.paypal.captureAuthorization(
      line.auth_id,
      line.amount_cents,
      false,
      `cap-${order.orderId}-${line.line_id}`,
      invoiceId,
    );
  } catch (err) {
    if (!isUncertain(err) && !isDuplicateInvoice(err)) {
      // PayPal clearly refused (e.g. AUTHORIZATION_VOIDED): no money moved.
      line.state = "CAPTURE_FAILED";
      line.error = `PayPal refused the charge (${err instanceof PayPalError ? err.issue ?? err.status : "error"}). Do not ship.`;
      logEvent(order, `CAPTURE_REFUSED ${line.line_id} ${line.error}`);
      return { verdict, captured: false, line };
    }
    // Timeout, 5xx, or "invoice already used": PayPal may have taken the money.
    // Ask PayPal's own record instead of guessing (risk R-P3).
    logEvent(order, `CAPTURE_UNCERTAIN ${line.line_id}, checking PayPal`);
    const found = await lookupCapture(order.orderId, invoiceId, deps);
    if (found === "unreachable" || found === null) {
      line.state = "CAPTURE_FAILED";
      line.capture_uncertain = true;
      line.error = UNCERTAIN_MESSAGE;
      logEvent(order, `CAPTURE_UNCONFIRMED ${line.line_id} (${found === null ? "not found yet" : "PayPal unreachable"})`);
      return { verdict, captured: false, line };
    }
    cap = found;
    logEvent(order, `CAPTURE_FOUND_BY_LOOKUP ${line.line_id} ${cap.id} ${cap.status}`);
  }

  if (cap.status === "COMPLETED") {
    // Record the charge immediately; tracking is best effort after this (review 1.3, 1.4).
    line.state = "CAPTURED";
    line.capture_id = cap.id;
    line.capture_uncertain = undefined;
    logEvent(order, `CAPTURED ${line.line_id} ${cap.id}`);
  } else {
    line.state = "CAPTURE_FAILED";
    line.capture_id = cap.id;
    // A PENDING capture may still complete, so close must check it again before releasing.
    if (cap.status === "PENDING") line.capture_uncertain = true;
    line.error = `PayPal capture status ${cap.status}${cap.status_details?.reason ? ` (${cap.status_details.reason})` : ""}. Do not ship.`;
    logEvent(order, `CAPTURE_NOT_COMPLETED ${line.line_id} ${cap.status}`);
    return { verdict, captured: false, capture_id: cap.id, line };
  }

  try {
    const carrierName = input.carrier && input.carrier.length <= 40 ? input.carrier : "Demo Courier";
    await deps.paypal.addTracking(order.orderId, line.capture_id!, tracking, carrierName, `track-${line.capture_id}`);
    line.tracking_number = tracking;
    logEvent(order, `TRACKING ${line.line_id} ${tracking}`);
  } catch (err) {
    line.tracking_number = tracking; // keep it in our store so the UI can still show it
    logEvent(order, `TRACKING_FAILED ${line.line_id} ${err instanceof Error ? err.message.slice(0, 120) : ""}`);
  }
  return { verdict, captured: true, capture_id: line.capture_id, line };
}

// ---------- close ----------

export async function closeOrder(orderId: string, deps: Deps = defaultDeps()): Promise<Order> {
  const order = load(orderId);
  if (order.status === "CLOSED") return order; // idempotent
  if (order.lines.some((l) => l.state === "SHIPPED")) {
    throw new HttpError(409, "still_processing", { message: "A part is still being checked. Try again in a moment." });
  }
  await settleUncertain(order, deps);

  // Void only authorisations that still hold uncaptured money (review 1.6).
  // Voiding a fully captured authorisation fails at PayPal, so those are skipped.
  const byAuth = new Map<string, Line[]>();
  for (const l of order.lines) if (l.auth_id) byAuth.set(l.auth_id, [...(byAuth.get(l.auth_id) ?? []), l]);

  for (const [authId, ls] of byAuth) {
    const holdsMoney = ls.some((l) => l.state === "AUTHORISED" || l.state === "NOT_CHARGED" || l.state === "CAPTURE_FAILED");
    if (!holdsMoney) continue;
    try {
      await deps.paypal.voidAuthorization(authId, `void-${authId}`);
      logEvent(order, `VOIDED ${authId}`);
    } catch (err) {
      // Carry on with the other authorisations; never stop half-way.
      logEvent(order, `VOID_FAILED ${authId} ${err instanceof PayPalError ? err.issue ?? err.status : ""}`);
    }
  }

  for (const l of order.lines) if (l.state === "AUTHORISED") l.state = "VOIDED";
  order.released_cents = order.lines
    .filter((l) => l.state === "VOIDED" || l.state === "NOT_CHARGED" || l.state === "CAPTURE_FAILED")
    .reduce((s, l) => s + l.amount_cents, 0);
  order.status = "CLOSED";
  logEvent(order, "CLOSED");
  return order;
}

// ---------- webhook ----------

type WebhookEvent = {
  event_type?: string;
  resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } } };
};

/** Finds which of our orders an event belongs to (review 1.20). */
export function attachWebhookEvent(event: WebhookEvent, all: Iterable<Order>): Order | undefined {
  const related = event.resource?.supplementary_data?.related_ids;
  const ids = [related?.order_id, related?.authorization_id, event.resource?.id].filter(Boolean) as string[];
  for (const o of all) {
    if (ids.includes(o.orderId) || o.lines.some((l) => ids.includes(l.auth_id ?? "") || ids.includes(l.capture_id ?? ""))) {
      logEvent(o, `WEBHOOK ${event.event_type ?? "UNKNOWN"}`);
      return o;
    }
  }
  return undefined;
}
