// Go/no-go test 3: add tracking to a capture.
import { evidence, id, pp, waitForApproval } from "./_gonogo.mts";
import { PayPalError } from "../lib/paypal";

const order = await pp.createOrder([{ reference_id: "platform", items: [{ name: "Tracking test", sku: "test", quantity: 1, unit_cents: 1000 }] }], id("order"));
await waitForApproval(order);
const auth = (await pp.authorizeOrder(order.id, `auth-${order.id}`)).purchase_units[0].payments!.authorizations![0];
const cap = await pp.captureAuthorization(auth.id, 1000, true, id("cap"));
try {
  await pp.addTracking(order.id, cap.id, "DEMO123", "Demo Courier", id("track"));
  evidence("3 Tracking on a capture", true, `order ${order.id} capture ${cap.id}: tracking DEMO123 accepted. Check it shows on the sandbox transaction.`);
} catch (e) {
  evidence("3 Tracking on a capture", false, e instanceof PayPalError ? `${e.status} ${e.issue ?? e.body.slice(0, 200)}` : String(e));
}
