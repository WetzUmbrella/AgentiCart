// Go/no-go test 1 (strengthened, review 1.7): one approval, two payees, then capture + tracking + void on EACH.
import { evidence, id, pp, waitForApproval } from "./_gonogo.mts";
import { PayPalError } from "../lib/paypal";

const a = process.env.MERCHANT_A_EMAIL, b = process.env.MERCHANT_B_EMAIL;
if (!a || !b) throw new Error("Set MERCHANT_A_EMAIL and MERCHANT_B_EMAIL in .env.local");
const item = [{ name: "Go/no-go item", sku: "test", quantity: 1, unit_cents: 2000 }];
const steps: string[] = [];
let pass = true;
try {
  const order = await pp.createOrder(
    [{ reference_id: "merchant_a", payee_email: a, items: item }, { reference_id: "merchant_b", payee_email: b, items: item }],
    id("order"),
  );
  await waitForApproval(order);
  const res = await pp.authorizeOrder(order.id, `auth-${order.id}`);
  for (const u of res.purchase_units) {
    const auth = u.payments?.authorizations?.[0];
    if (!auth) { pass = false; steps.push(`${u.reference_id}: no authorisation`); continue; }
    try {
      const cap = await pp.captureAuthorization(auth.id, 100, false, id("cap"));
      await pp.addTracking(order.id, cap.id, "DEMO1", "Demo Courier", id("track"));
      await pp.voidAuthorization(auth.id, `void-${auth.id}`);
      steps.push(`${u.reference_id}: auth ${auth.id} capture ${cap.status} + tracking + void OK`);
      if (cap.status !== "COMPLETED") pass = false;
    } catch (e) {
      pass = false;
      steps.push(`${u.reference_id}: ${e instanceof PayPalError ? `${e.status} ${e.issue ?? e.body.slice(0, 200)}` : e}`);
    }
  }
} catch (e) {
  pass = false;
  steps.push(e instanceof PayPalError ? `${e.status} ${e.issue ?? e.body.slice(0, 300)}` : String(e));
}
steps.forEach((s) => console.log(s));
evidence("1 One approval, several merchants", pass, steps.join("; "));
