import { invoiceIdFor } from "./orders";
import type { Capture, PayPalApi } from "./paypal";
import { fromValue } from "./money";
import type { Line, Order, OrderStatus } from "./types";

/**
 * Reconciliation: proves that every cent we held for an order sits in exactly one place.
 *
 *   held = charged + released + still held + unknown
 *
 * and that the record is consistent with itself and, in version 2, with PayPal's own record.
 *
 * Design choices (docs/reconciliation.md):
 * - Read-only. Neither function captures, voids or edits the order. The PayPal version only accepts
 *   the two read calls, so the type system stops a checker from ever moving money.
 * - Independent of the code it checks. The bucket rules below are written from the line states,
 *   not by reusing closeOrder's helpers; a check that calls the code it checks proves nothing.
 * - Fails closed. Anything we cannot place is "unknown", never "pass". An unexpected state is "fail".
 */

export type ReconcileStatus = "PASS" | "FAIL" | "UNKNOWN";

export type Reconciliation = {
  orderId: string;
  order_status: OrderStatus;
  /** PASS: every cent placed and every rule held. UNKNOWN: some money cannot be placed yet. FAIL: a rule broke. */
  status: ReconcileStatus;
  /** true only when the order is closed and nothing is held or unknown: the books for this order are done. */
  settled: boolean;
  held_cents: number;
  charged_cents: number;
  released_cents: number;
  still_held_cents: number;
  unknown_cents: number;
  /** Why the result is not PASS, one line per problem, naming the line or authorisation. Empty on PASS. */
  reasons: string[];
  /** Set by reconcileWithPayPal: whether PayPal's record was compared, or why it could not be. */
  paypal?: "MATCHED" | "MISMATCH" | "UNREACHABLE";
};

type Bucket = "charged" | "released" | "still_held" | "unknown" | "not_held";

/** Which bucket a line's money is in, or a reason the line is in an impossible state. */
function bucketOf(l: Line, voided: ReadonlySet<string>): { bucket: Bucket; problem?: string } {
  if (!l.auth_id) {
    // No authorisation, so no money was ever reserved. Only an untouched line may look like this.
    return l.state === "IN_BUNDLE"
      ? { bucket: "not_held" }
      : { bucket: "not_held", problem: `${l.line_id} is ${l.state} but has no authorisation` };
  }
  // A charge PayPal has not confirmed either way: never counted as charged or released.
  if (l.capture_uncertain) return { bucket: "unknown" };

  const released = voided.has(l.auth_id);
  switch (l.state) {
    case "CAPTURED":
      return l.capture_id
        ? { bucket: "charged" }
        : { bucket: "charged", problem: `${l.line_id} is CAPTURED but has no capture ID` };
    case "VOIDED":
      return released
        ? { bucket: "released" }
        : { bucket: "still_held", problem: `${l.line_id} is VOIDED but PayPal never confirmed the void of ${l.auth_id}` };
    case "NOT_CHARGED":
    case "CAPTURE_FAILED":
      // Never charged. The money is released once its authorisation is voided, held until then.
      return { bucket: released ? "released" : "still_held" };
    case "AUTHORISED":
    case "SHIPPED":
    case "IN_BUNDLE":
      return released
        ? { bucket: "released", problem: `${l.line_id} is ${l.state} but its hold ${l.auth_id} was voided` }
        : { bucket: "still_held" };
    default:
      // A state added later that this check does not know: fail closed rather than guess.
      return { bucket: "still_held", problem: `${l.line_id} has a state reconcile does not know: ${(l as Line).state}` };
  }
}

/** Version 1: checks our own order record. Pure, synchronous, no PayPal call. */
export function reconcile(order: Order): Reconciliation {
  const voided = new Set(order.voided_auth_ids ?? []);
  const totals = { charged: 0, released: 0, still_held: 0, unknown: 0, not_held: 0 };
  const problems: string[] = []; // each one makes the result FAIL
  const unknowns: string[] = []; // each one makes the result UNKNOWN at best
  let held = 0;

  for (const l of order.lines) {
    const { bucket, problem } = bucketOf(l, voided);
    if (problem) problems.push(problem);
    if (bucket === "not_held") continue;
    held += l.amount_cents;
    totals[bucket] += l.amount_cents;
    if (bucket === "unknown") unknowns.push(`${l.line_id}: PayPal has not confirmed whether it was charged`);
  }

  const closed = order.status === "CLOSED";
  if (closed && totals.still_held > 0) {
    problems.push(`order is closed but ${totals.still_held} cents are still held at PayPal`);
  }
  // Two independent counts of "released" must agree: closeOrder's figure and ours.
  if (closed && (order.released_cents ?? 0) !== totals.released) {
    problems.push(`order says ${order.released_cents ?? 0} cents released, the lines add up to ${totals.released}`);
  }
  if (!closed && order.released_cents !== undefined && order.released_cents > 0) {
    problems.push(`order is open but already reports ${order.released_cents} cents released`);
  }

  const status: ReconcileStatus = problems.length ? "FAIL" : unknowns.length ? "UNKNOWN" : "PASS";
  return {
    orderId: order.orderId,
    order_status: order.status,
    status,
    settled: status === "PASS" && closed && totals.still_held === 0,
    held_cents: held,
    charged_cents: totals.charged,
    released_cents: totals.released,
    still_held_cents: totals.still_held,
    unknown_cents: totals.unknown,
    reasons: [...problems, ...unknowns],
  };
}

/** Only the read calls. A reconciler that is handed capture or void is one bug away from moving money. */
export type PayPalReader = Pick<PayPalApi, "getOrder" | "getAuthorization">;

type PayPalCapture = Capture & { amount?: { value: string } };

/**
 * Version 2: version 1, then compares our record with PayPal's, per line and per authorisation.
 *
 * Per line (matched by the invoice_id every capture carries):
 *   - PayPal shows a completed charge we do not record as CAPTURED: FAIL (shopper paid, merchant told not to ship).
 *   - We record CAPTURED and PayPal has no such charge: FAIL (merchant ships, nobody paid).
 *   - Capture IDs or amounts differ: FAIL. A charge still PENDING at PayPal: UNKNOWN.
 *   - A charge at PayPal that belongs to no line: FAIL.
 * Per authorisation:
 *   - We say voided: PayPal must say VOIDED.
 *   - Every line on it charged: PayPal must say CAPTURED.
 *   - Otherwise it must still be holding (CREATED or PARTIALLY_CAPTURED); VOIDED or EXPIRED means the hold is gone.
 *   - If PayPal returns the authorised amount, it must equal the sum of our lines on it.
 * If PayPal cannot be reached the result is UNKNOWN, never PASS.
 */
export async function reconcileWithPayPal(order: Order, paypal: PayPalReader): Promise<Reconciliation> {
  const base = reconcile(order);
  const reasons = [...base.reasons];
  const mismatches: string[] = [];
  let unknown = base.status === "UNKNOWN";
  let unreachable = false;

  let captures: PayPalCapture[];
  try {
    const record = await paypal.getOrder(order.orderId);
    captures = record.purchase_units.flatMap((u) => (u.payments?.captures ?? []) as PayPalCapture[]);
  } catch {
    return {
      ...base,
      status: base.status === "FAIL" ? "FAIL" : "UNKNOWN",
      settled: false,
      reasons: [...reasons, "PayPal could not be reached, so its record was not compared"],
      paypal: "UNREACHABLE",
    };
  }

  // Per line.
  const claimed = new Set<PayPalCapture>();
  for (const l of order.lines) {
    const mine = captures.filter((c) => c.invoice_id === invoiceIdFor(order.orderId, l.line_id));
    mine.forEach((c) => claimed.add(c));
    const done = mine.filter((c) => c.status === "COMPLETED");
    if (mine.some((c) => c.status === "PENDING")) {
      unknown = true;
      reasons.push(`${l.line_id}: PayPal shows the charge as PENDING`);
    }
    if (done.length > 1) mismatches.push(`${l.line_id}: PayPal shows ${done.length} completed charges for one line`);

    if (l.capture_uncertain) {
      // Expected to be settled at close; report what PayPal says so the merchant knows.
      if (done.length) reasons.push(`${l.line_id}: PayPal shows it charged (${done[0].id}); close will record it`);
      continue;
    }
    if (l.state === "CAPTURED") {
      const match = done.find((c) => c.id === l.capture_id);
      if (!match) mismatches.push(`${l.line_id}: we record charge ${l.capture_id ?? "(none)"}, PayPal has no such completed charge`);
      else if (match.amount && fromValue(match.amount.value) !== l.amount_cents) {
        mismatches.push(`${l.line_id}: we charged ${l.amount_cents} cents, PayPal shows ${fromValue(match.amount.value)}`);
      }
    } else if (done.length) {
      mismatches.push(`${l.line_id}: PayPal shows a completed charge (${done[0].id}) but we record ${l.state}`);
    }
  }
  for (const c of captures) {
    if (!claimed.has(c) && c.status === "COMPLETED") mismatches.push(`PayPal charge ${c.id} belongs to no line on this order`);
  }

  // Per authorisation.
  const voided = new Set(order.voided_auth_ids ?? []);
  const byAuth = new Map<string, Line[]>();
  for (const l of order.lines) if (l.auth_id) byAuth.set(l.auth_id, [...(byAuth.get(l.auth_id) ?? []), l]);

  for (const [authId, ls] of byAuth) {
    let auth;
    try {
      auth = await paypal.getAuthorization(authId);
    } catch {
      unknown = unreachable = true;
      reasons.push(`${authId}: PayPal could not be reached for this authorisation`);
      continue;
    }
    // While a charge on this hold is unconfirmed, its status cannot be predicted; that line is already UNKNOWN.
    const settledLines = !ls.some((l) => l.capture_uncertain);
    const allCharged = ls.every((l) => l.state === "CAPTURED");
    const expected = voided.has(authId) ? ["VOIDED"] : allCharged ? ["CAPTURED"] : ["CREATED", "PARTIALLY_CAPTURED"];
    if (settledLines && !expected.includes(auth.status)) {
      mismatches.push(`${authId}: we expect ${expected.join(" or ")}, PayPal says ${auth.status}`);
    }
    if (auth.amount) {
      const ours = ls.reduce((s, l) => s + l.amount_cents, 0);
      const theirs = fromValue(auth.amount.value);
      if (ours !== theirs) mismatches.push(`${authId}: our lines add up to ${ours} cents, PayPal authorised ${theirs}`);
    }
  }

  const all = [...reasons, ...mismatches];
  const status: ReconcileStatus =
    base.status === "FAIL" || mismatches.length ? "FAIL" : unknown ? "UNKNOWN" : "PASS";
  return {
    ...base,
    status,
    settled: base.settled && status === "PASS",
    reasons: all,
    paypal: mismatches.length ? "MISMATCH" : unreachable ? "UNREACHABLE" : "MATCHED",
  };
}
