// Sandbox money-path check: tests, once each, the assumptions lib/paypal-mock.ts makes about real PayPal.
// Run from the repo root:  npx tsx scripts/sandbox-money-path.mts
//
// Creates TWO real orders on the shared sandbox app. Each needs one approval as the sandbox shopper.
//   Order A, clean path ($100.00 in three lines: L1 $50, L2 $30, L3 $20):
//     partial captures of L1 and L2, a mocked AUTHORIZATION_EXPIRED, void, capture after void, void twice,
//     invoice_id lookup in PayPal's order record, then reconcile v2 against that record. Expected: PASS.
//   Order B, limits probe ($20.00): duplicate invoice_id with a new request ID, and over-capture by 1 cent.
//     Kept apart from A: if PayPal accepts either, the stray charge would sit on A and could use up its hold.
//
// reconcile runs on a hand-built CLOSED order made from A's real IDs. It tests reconcile's comparison with
// PayPal, not the app's state machine (H17 covers that).
// Prints records only: IDs, statuses, amounts, issue codes, debug_id. Never request headers or tokens.
import { randomUUID } from "crypto";
import { pp } from "./_gonogo.mts";
import { config } from "../lib/config";
import { invoiceIdFor } from "../lib/orders";
import { PayPalError, isUncertain, type AuthorizedOrder, type Capture } from "../lib/paypal";
import { reconcileWithPayPal } from "../lib/reconcile";
import type { Line, Order } from "../lib/types";

const SANDBOX = "https://api-m.sandbox.paypal.com";
if (config.paypalBase !== SANDBOX) {
  console.error(`Refusing to run: PayPal base URL is ${config.paypalBase}, not ${SANDBOX}.`);
  process.exit(1);
}
console.log(`PayPal base: ${config.paypalBase}`);
console.log(`PAYPAL_MODE=${process.env.PAYPAL_MODE ?? "unset"} (ignored: scripts always call the real sandbox)`);

const rid = (prefix: string) => `${prefix}-${randomUUID()}`; // fresh PayPal-Request-Id every call
const EXPIRED = JSON.stringify({ mock_application_codes: "AUTHORIZATION_EXPIRED" });
type PPCapture = Capture & { amount?: { value: string } };

// ---------- helpers ----------

type Outcome<T> = { ok: true; value: T } | { ok: false; err: unknown };
async function attempt<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, err };
  }
}

function explain(err: unknown): string {
  if (!(err instanceof PayPalError)) return `non-PayPal error: ${err instanceof Error ? err.message : String(err)}`;
  let debugId = "";
  try {
    debugId = JSON.parse(err.body)?.debug_id ?? "";
  } catch {
    /* body was not JSON */
  }
  return `HTTP ${err.status} ${err.issue ?? "(no issue code)"}${debugId ? ` debug_id=${debugId}` : ""}${isUncertain(err) ? " [uncertain]" : ""}`;
}

function show(o: Outcome<unknown>): string {
  if (!o.ok) return explain(o.err);
  const v = o.value as { id?: string; status?: string } | undefined;
  return v && (v.id || v.status) ? `accepted ${v.id ?? ""} ${v.status ?? ""}`.trim() : "accepted";
}

const refusedWith = (o: Outcome<unknown>, issue: string) =>
  !o.ok && o.err instanceof PayPalError && !isUncertain(o.err) && o.err.issue === issue;

async function authStatus(authId: string): Promise<string> {
  const r = await attempt(() => pp.getAuthorization(authId));
  return r.ok ? `${r.value.status}${r.value.amount ? ` (${r.value.amount.value})` : ""}` : `lookup failed: ${explain(r.err)}`;
}

type Verdict = "MOCK RIGHT" | "MOCK WRONG" | "NOT RUN";
const results: { check: string; mock: string; observed: string; verdict: Verdict }[] = [];
function record(check: string, mock: string, observed: string, right: boolean | null) {
  const verdict: Verdict = right === null ? "NOT RUN" : right ? "MOCK RIGHT" : "MOCK WRONG";
  results.push({ check, mock, observed, verdict });
  console.log(`  [${verdict}] ${check}: ${observed}`);
}

// Polls the order (read-only GET) every 5 s for up to 15 min until PayPal records the approval.
// An order that never reaches APPROVED holds no money; authorise is only sent once it has.
async function pollApproval(order: { id: string; links?: { href: string; rel: string }[] }): Promise<void> {
  const link = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  console.log(`\nOrder ${order.id}\nOpen this link in a private window, log in as the SANDBOX SHOPPER and approve:\n${link}`);
  console.log("Do not press Enter. The script checks PayPal every 5 s and moves on by itself once the order is APPROVED.\n");
  const deadline = Date.now() + 15 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await attempt(() => pp.getOrder(order.id));
    const status = r.ok ? r.value.status : `lookup failed: ${explain(r.err)}`;
    if (status !== last) {
      console.log(`  ${new Date().toLocaleTimeString("en-SG")} order status: ${status}`);
      last = status;
    }
    if (r.ok && r.value.status === "APPROVED") return;
    await new Promise((done) => setTimeout(done, 5_000));
  }
  console.error(`Order ${order.id}: not APPROVED after 15 min (last status: ${last}). Nothing is held; the order lapses unapproved.`);
  process.exit(1);
}

async function approvedAuth(label: string, items: { sku: string; cents: number }[]) {
  const order = await pp.createOrder(
    [
      {
        reference_id: "platform",
        items: items.map((i) => ({ name: `Sandbox money-path ${label} ${i.sku}`, sku: i.sku, quantity: 1, unit_cents: i.cents })),
      },
    ],
    rid(`order-${label}`),
  );
  // Approval is read from PayPal's own order record, not from an Enter press (two runs failed on timing).
  await pollApproval(order);
  const r = await attempt(() => pp.authorizeOrder(order.id, rid(`auth-${label}`)));
  if (!r.ok) {
    const unsure = isUncertain(r.err);
    console.error(
      `Order ${order.id}: authorise failed: ${explain(r.err)}. ` +
        (unsure
          ? `PayPal may have acted: run  npx tsx scripts/check-hold.mts ${order.id}  before anything else.`
          : "PayPal refused, so nothing is held."),
    );
    process.exit(1);
  }
  const authorised: AuthorizedOrder = r.value;
  const auth = authorised.purchase_units[0]?.payments?.authorizations?.[0];
  if (!auth || auth.status !== "CREATED") {
    console.error(`Order ${order.id}: authorisation not CREATED (${auth?.status ?? "missing"}). Was it approved?`);
    process.exit(1);
  }
  console.log(`Order ${order.id}, authorisation ${auth.id} ${auth.status} ${auth.amount?.value ?? "(no amount)"}`);
  return { orderId: order.id, authId: auth.id };
}

// ---------- Order A: clean money path ----------

console.log("\n=== Order A: clean money path ($100.00: L1 $50.00, L2 $30.00, L3 $20.00)");
const A_LINES = [
  { sku: "L1", cents: 5000 },
  { sku: "L2", cents: 3000 },
  { sku: "L3", cents: 2000 },
];
const A = await approvedAuth("A", A_LINES);

const capL1 = await attempt(() => pp.captureAuthorization(A.authId, 5000, false, rid("cap-L1"), invoiceIdFor(A.orderId, "L1")));
console.log(`capture L1 $50.00: ${show(capL1)}`);
const afterFirst = await authStatus(A.authId);
record("A1 auth status after one partial capture", "PARTIALLY_CAPTURED", afterFirst, capL1.ok ? afterFirst.startsWith("PARTIALLY_CAPTURED") : null);

const capL2 = await attempt(() => pp.captureAuthorization(A.authId, 3000, false, rid("cap-L2"), invoiceIdFor(A.orderId, "L2")));
console.log(`capture L2 $30.00: ${show(capL2)}`);
console.log(`auth after two partial captures: ${await authStatus(A.authId)}`);

// Mocked expiry: fresh request ID (a reused one would replay an earlier reply) and an invoice_id no line owns,
// so if PayPal processed it for real, reconcile reports a charge that belongs to no line.
const expired = await attempt(() =>
  pp.captureAuthorization(A.authId, 2000, false, rid("cap-expired"), invoiceIdFor(A.orderId, "probe-expired"), EXPIRED),
);
record(
  "A2 capture on an expired auth (PayPal-Mock-Response)",
  "not modelled; app needs a clear refusal: AUTHORIZATION_EXPIRED, not uncertain",
  show(expired),
  refusedWith(expired, "AUTHORIZATION_EXPIRED"),
);

const voidA = await attempt(() => pp.voidAuthorization(A.authId, `void-${A.authId}`));
record("A3 void after partial captures", "succeeds", show(voidA), voidA.ok);
const afterVoid = await authStatus(A.authId);
record("A4 auth status after void", "VOIDED", afterVoid, voidA.ok ? afterVoid.startsWith("VOIDED") : null);

const capAfterVoid = await attempt(() =>
  pp.captureAuthorization(A.authId, 2000, false, rid("cap-after-void"), invoiceIdFor(A.orderId, "probe-after-void")),
);
record(
  "A5 capture after void (orders.ts only needs a clear 4xx refusal)",
  "422 AUTHORIZATION_VOIDED",
  show(capAfterVoid),
  voidA.ok ? refusedWith(capAfterVoid, "AUTHORIZATION_VOIDED") : null,
);

// New request ID on purpose: the app's own retry reuses void-<authId>, which PayPal would just replay.
const voidAgain = await attempt(() => pp.voidAuthorization(A.authId, rid("void-again")));
const afterVoidAgain = await authStatus(A.authId);
record(
  "A6 void twice (closeOrder then reads the auth; it must say VOIDED)",
  "422 PREVIOUSLY_VOIDED",
  `${show(voidAgain)}; auth then reads ${afterVoidAgain}`,
  voidA.ok ? refusedWith(voidAgain, "PREVIOUSLY_VOIDED") : null,
);

// R-P3: can a capture be found again in PayPal's order record by our invoice_id?
const recordA = await attempt(() => pp.getOrder(A.orderId));
let recordCaps: PPCapture[] = [];
if (recordA.ok) {
  recordCaps = recordA.value.purchase_units.flatMap((u) => (u.payments?.captures ?? []) as PPCapture[]);
  console.log("captures in PayPal's order record:");
  for (const c of recordCaps) console.log(`  ${c.id} ${c.status} amount=${c.amount?.value ?? "(none)"} invoice_id=${c.invoice_id ?? "(none)"}`);
} else {
  console.log(`getOrder failed: ${explain(recordA.err)}`);
}
const findsOwn = (line: string, cap: Outcome<Capture>) =>
  cap.ok && recordCaps.some((c) => c.invoice_id === invoiceIdFor(A.orderId, line) && c.id === cap.value.id);
record(
  "A7 invoice_id on captures in the order record (R-P3)",
  "each capture carries our invoice_id",
  recordA.ok ? `L1 ${findsOwn("L1", capL1) ? "found" : "NOT found"}, L2 ${findsOwn("L2", capL2) ? "found" : "NOT found"}` : "getOrder failed",
  recordA.ok && capL1.ok && capL2.ok ? findsOwn("L1", capL1) && findsOwn("L2", capL2) : null,
);

// reconcile v2 on a hand-built closed order: L1, L2 charged; L3 never charged and released by the void.
const done = (o: Outcome<Capture>): o is { ok: true; value: Capture } => o.ok && o.value.status === "COMPLETED";
if (done(capL1) && done(capL2) && voidA.ok) {
  const line = (line_id: string, amount_cents: number, extra: Partial<Line>): Line => ({
    line_id,
    product_id: `sandbox-${line_id}`,
    name: `Sandbox money-path A ${line_id}`,
    merchant: "platform",
    qty: 1,
    amount_cents,
    auth_id: A.authId,
    state: "NOT_CHARGED",
    ...extra,
  });
  const now = Date.now();
  const order: Order = {
    orderId: A.orderId,
    status: "CLOSED",
    created_at: now,
    closed_at: now,
    events: [],
    released_cents: 2000,
    voided_auth_ids: [A.authId],
    lines: [
      line("L1", 5000, { state: "CAPTURED", capture_id: capL1.value.id }),
      line("L2", 3000, { state: "CAPTURED", capture_id: capL2.value.id }),
      line("L3", 2000, { state: "NOT_CHARGED" }),
    ],
  };
  const r = await reconcileWithPayPal(order, pp);
  console.log("reconcile v2:", JSON.stringify(r, null, 2));
  const capAmounts = recordCaps.filter((c) => c.amount).length;
  const authAmount = await attempt(() => pp.getAuthorization(A.authId));
  const amountsRan = capAmounts > 0 && authAmount.ok && Boolean(authAmount.value.amount);
  record(
    "A8 reconcile v2 against PayPal's real record",
    "PASS, settled",
    `${r.status}, settled=${r.settled}, paypal=${r.paypal}; amount checks ${amountsRan ? "ran" : "SKIPPED"} (capture amounts: ${capAmounts}/${recordCaps.length}, auth amount: ${authAmount.ok && authAmount.value.amount ? authAmount.value.amount.value : "none"})`,
    r.status === "PASS" && r.settled && amountsRan,
  );
} else {
  record("A8 reconcile v2 against PayPal's real record", "PASS, settled", "skipped: L1/L2 not both COMPLETED or void failed", null);
}

// ---------- Order B: limits probe ----------

console.log("\n=== Order B: limits probe ($20.00)");
const B = await approvedAuth("B", [{ sku: "B1", cents: 2000 }]);
let capturedB = 0;
const b1 = await attempt(() => pp.captureAuthorization(B.authId, 1000, false, rid("cap-B1"), invoiceIdFor(B.orderId, "B1")));
console.log(`capture B1 $10.00: ${show(b1)}`);
if (b1.ok && b1.value.status === "COMPLETED") capturedB += 1000;

if (b1.ok) {
  // Same invoice_id, NEW request ID: the request-ID dedupe cannot be what stops it.
  const dup = await attempt(() => pp.captureAuthorization(B.authId, 100, false, rid("cap-dup"), invoiceIdFor(B.orderId, "B1")));
  if (dup.ok && dup.value.status === "COMPLETED") capturedB += 100;
  record(
    "B1 capture with a used invoice_id, new request ID",
    "422 DUPLICATE_INVOICE_ID (if accepted: only the request ID prevents double charges)",
    show(dup),
    refusedWith(dup, "DUPLICATE_INVOICE_ID"),
  );

  const remaining = 2000 - capturedB;
  const over = await attempt(() =>
    pp.captureAuthorization(B.authId, remaining + 1, false, rid("cap-over"), invoiceIdFor(B.orderId, "probe-over")),
  );
  record(
    `B2 capture 1 cent over what is left (${remaining + 1} cents on ${remaining} left)`,
    "422 MAX_CAPTURE_AMOUNT_EXCEEDED (if accepted: PayPal is no backstop)",
    show(over),
    refusedWith(over, "MAX_CAPTURE_AMOUNT_EXCEEDED"),
  );
} else {
  record("B1 capture with a used invoice_id, new request ID", "422 DUPLICATE_INVOICE_ID", "skipped: first capture failed", null);
  record("B2 capture 1 cent over what is left", "422 MAX_CAPTURE_AMOUNT_EXCEEDED", "skipped: first capture failed", null);
}

const voidB = await attempt(() => pp.voidAuthorization(B.authId, `void-${B.authId}`));
console.log(`cleanup: void B: ${show(voidB)}; auth now ${await authStatus(B.authId)}`);

// ---------- summary ----------

console.log(`\nOrders: A=${A.orderId} (auth ${A.authId}), B=${B.orderId} (auth ${B.authId})`);
console.log("\n| Check | Mock assumes | Observed | Verdict |\n|---|---|---|---|");
for (const r of results) console.log(`| ${r.check} | ${r.mock} | ${r.observed} | ${r.verdict} |`);
const wrong = results.filter((r) => r.verdict === "MOCK WRONG").length;
const notRun = results.filter((r) => r.verdict === "NOT RUN").length;
console.log(`\n${results.length - wrong - notRun} mock right, ${wrong} mock wrong, ${notRun} not run.`);
