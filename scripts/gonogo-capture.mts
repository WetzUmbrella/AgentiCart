// Go/no-go test 2: two partial captures on one authorisation, then void (and the final_capture fallback).
// Also checks the fact risk R-P3 depends on: does PayPal's order record return our invoice_id on each
// capture, so a capture whose reply was lost can be found again?
import { evidence, id, pp, waitForApproval } from "./_gonogo.mts";
import { PayPalError } from "../lib/paypal";

const item = (cents: number) => [{ name: "Go/no-go test item", sku: "test", quantity: 1, unit_cents: cents }];
const order = await pp.createOrder([{ reference_id: "platform", items: item(15000) }], id("order"));
await waitForApproval(order);
const auth = (await pp.authorizeOrder(order.id, `auth-${order.id}`)).purchase_units[0].payments!.authorizations![0];
console.log("authorisation", auth.id, auth.status);
const inv1 = `${order.id}-gonogo-1`;
const inv2 = `${order.id}-gonogo-2`;
const c1 = await pp.captureAuthorization(auth.id, 5000, false, id("cap1"), inv1);
const c2 = await pp.captureAuthorization(auth.id, 3000, false, id("cap2"), inv2);
console.log("captures", c1.id, c1.status, c2.id, c2.status);

// R-P3 check: find both captures again by invoice_id in PayPal's order record.
let lookup = "not checked";
try {
  const record = await pp.getOrder(order.id);
  const caps = record.purchase_units.flatMap((u) => u.payments?.captures ?? []);
  const found = [inv1, inv2].filter((inv) => caps.some((c) => c.invoice_id === inv));
  lookup = found.length === 2 ? "OK (both captures found by invoice_id)" : `NOT RETURNED (found ${found.length}/2; raw: ${JSON.stringify(caps).slice(0, 200)})`;
} catch (e) {
  lookup = `FAILED: ${e instanceof PayPalError ? e.issue ?? e.status : e}`;
}
console.log("invoice_id lookup:", lookup);

let voidOk = false;
try {
  await pp.voidAuthorization(auth.id, `void-${auth.id}`);
  voidOk = true;
  console.log("void after partial captures: OK");
} catch (e) {
  console.log("void after partial captures FAILED:", e instanceof PayPalError ? e.issue ?? e.body : e);
}
let authAfter = "unknown";
try {
  authAfter = (await pp.getAuthorization(auth.id)).status;
} catch {
  /* reported as unknown */
}
const pass = c1.status === "COMPLETED" && c2.status === "COMPLETED";
evidence(
  "2 Partial captures + void",
  pass,
  `auth ${auth.id}; captures ${c1.id}=${c1.status}, ${c2.id}=${c2.status}; void after partial: ${voidOk ? "OK" : "FAILED (run test 2b: one purchase unit per line)"}; authorisation now ${authAfter}; invoice_id lookup: ${lookup}. Check the platform account shows $80.00.`,
);
