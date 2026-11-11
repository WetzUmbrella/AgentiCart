// Read-only check: is a sandbox order still holding money?
// Run from the repo root:  npx tsx scripts/check-hold.mts [orderId]
// Default order: 8M979775TP471160X (4 Nov money-path run; outcome never seen).
//
// Sends GET requests only (getOrder, getAuthorization). Never authorises, captures or voids.
// Prints IDs, statuses, amounts, issue codes and debug_id. Never tokens or request headers.
// Exit code: 0 nothing held, 2 a hold is open, 3 could not tell.
import "./_env.mts";
import { config } from "../lib/config";
import { restPayPal as pp, PayPalError, isUncertain, type OrderDetails } from "../lib/paypal";

const SANDBOX = "https://api-m.sandbox.paypal.com";
if (config.paypalBase !== SANDBOX) {
  console.error(`Refusing to run: PayPal base URL is ${config.paypalBase}, not ${SANDBOX}.`);
  process.exit(1);
}

const orderId = process.argv[2] ?? "8M979775TP471160X";

// PayPal returns more fields than lib/paypal.ts types; these are the ones worth printing.
type RawAuth = {
  id: string;
  status: string;
  amount?: { value: string; currency_code?: string };
  create_time?: string;
  expiration_time?: string;
  status_details?: { reason?: string };
};
type RawCapture = { id: string; status: string; amount?: { value: string }; invoice_id?: string; final_capture?: boolean };

// Authorisation statuses. Anything not listed is treated as "could not tell", never as closed.
const HOLDING = new Set(["CREATED", "PARTIALLY_CAPTURED", "PENDING"]);
const RELEASED = new Set(["CAPTURED", "VOIDED", "EXPIRED", "DENIED"]);

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

const cents = (v?: string) => (v ? Math.round(Number(v) * 100) : 0);
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

console.log(`PayPal base: ${config.paypalBase}`);
console.log(`Order ${orderId}`);

let order: OrderDetails;
try {
  order = await pp.getOrder(orderId);
} catch (err) {
  console.log(`  getOrder failed: ${explain(err)}`);
  console.log("VERDICT: COULD NOT TELL. Paste this line; do not re-run the money-path script yet.");
  process.exit(3);
}

console.log(`  order status: ${order.status}`);
let holding = 0;
let unclear = 0;
let sawVoid = false;
let authCount = 0;

for (const [i, unit] of order.purchase_units.entries()) {
  const auths = (unit.payments?.authorizations ?? []) as RawAuth[];
  const caps = (unit.payments?.captures ?? []) as RawCapture[];
  console.log(`  purchase unit ${i} (${unit.reference_id ?? "no reference_id"}): ${auths.length} authorisation(s), ${caps.length} capture(s)`);

  let capturedCents = 0;
  for (const c of caps) {
    if (c.status === "COMPLETED" || c.status === "PENDING") capturedCents += cents(c.amount?.value);
    console.log(
      `    capture ${c.id} ${c.status} ${c.amount?.value ?? "(no amount)"}` +
        ` invoice_id=${c.invoice_id ?? "(none)"} final_capture=${c.final_capture ?? "(not shown)"}`,
    );
  }

  for (const a of auths) {
    authCount++;
    // The order record can lag; read the authorisation itself as well.
    let live: RawAuth | undefined;
    let liveNote = "";
    try {
      live = (await pp.getAuthorization(a.id)) as RawAuth;
    } catch (err) {
      liveNote = `getAuthorization failed: ${explain(err)}`;
    }
    const status = live?.status ?? a.status;
    const amount = live?.amount?.value ?? a.amount?.value;
    const expires = live?.expiration_time ?? a.expiration_time;
    console.log(
      `    authorisation ${a.id}: order record says ${a.status}, direct read says ${live ? live.status : "(failed)"}` +
        ` | amount ${amount ?? "(none)"} | created ${a.create_time ?? "?"} | expires ${expires ?? "?"}` +
        `${live?.status_details?.reason ? ` | reason ${live.status_details.reason}` : ""}`,
    );
    if (liveNote) console.log(`      ${liveNote}`);

    if (!live) {
      unclear++;
    } else if (HOLDING.has(status)) {
      holding++;
      const left = cents(amount) - capturedCents;
      console.log(`      HOLDING: authorised ${amount}, captured ${usd(capturedCents)}, up to ${usd(Math.max(left, 0))} still held`);
    } else if (RELEASED.has(status)) {
      if (status === "VOIDED") sawVoid = true;
    } else {
      unclear++;
      console.log(`      status ${status} is not one this script knows; check it by hand`);
    }
  }
}

if (authCount === 0) {
  console.log("VERDICT: NOTHING HELD. No authorisation on this order, so the script stopped before authorising.");
  process.exit(0);
}
if (holding > 0) {
  console.log(`VERDICT: HOLD OPEN on ${holding} authorisation(s). Paste this output; the void is a separate step.`);
  process.exit(2);
}
if (unclear > 0) {
  console.log("VERDICT: COULD NOT TELL for at least one authorisation. Paste this output.");
  process.exit(3);
}
console.log("VERDICT: NOTHING HELD. Every authorisation is captured, voided, expired or denied.");
if (sawVoid) {
  console.log("NOTE: a VOIDED authorisation means the script got past Order A, so it probably created Order B.");
  console.log("      B's ID is in that terminal's scrollback or the sandbox dashboard; run this script on it too.");
}
process.exit(0);
