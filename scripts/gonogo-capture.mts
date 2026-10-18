// Go/no-go test 2: two partial captures on one authorisation, then void (and the final_capture fallback).
import { evidence, id, pp, waitForApproval } from "./_gonogo.mts";
import { PayPalError } from "../lib/paypal";

const item = (cents: number) => [{ name: "Go/no-go test item", sku: "test", quantity: 1, unit_cents: cents }];
const order = await pp.createOrder([{ reference_id: "platform", items: item(15000) }], id("order"));
await waitForApproval(order);
const auth = (await pp.authorizeOrder(order.id, `auth-${order.id}`)).purchase_units[0].payments!.authorizations![0];
console.log("authorisation", auth.id, auth.status);
const c1 = await pp.captureAuthorization(auth.id, 5000, false, id("cap1"));
const c2 = await pp.captureAuthorization(auth.id, 3000, false, id("cap2"));
console.log("captures", c1.id, c1.status, c2.id, c2.status);
let voidOk = false;
try {
  await pp.voidAuthorization(auth.id, `void-${auth.id}`);
  voidOk = true;
  console.log("void after partial captures: OK");
} catch (e) {
  console.log("void after partial captures FAILED:", e instanceof PayPalError ? e.issue ?? e.body : e);
}
const pass = c1.status === "COMPLETED" && c2.status === "COMPLETED";
evidence(
  "2 Partial captures + void",
  pass,
  `auth ${auth.id}; captures ${c1.id}=${c1.status}, ${c2.id}=${c2.status}; void after partial: ${voidOk ? "OK" : "FAILED (use final_capture:true on the last capture)"}. Check the platform account shows $80.00.`,
);
