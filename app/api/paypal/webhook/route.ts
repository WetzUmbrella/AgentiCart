import { getPayPal } from "@/lib/paypal";
import { attachWebhookEvent } from "@/lib/orders";
import { orders } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Read the raw body before anything parses it, or the signature check fails.
  const raw = await req.text();
  try {
    const ok = await getPayPal().verifyWebhook(req.headers, raw);
    if (ok) attachWebhookEvent(JSON.parse(raw), orders.values());
    else console.warn("Webhook not verified; ignored.");
  } catch (err) {
    console.error("Webhook error", err);
  }
  // Always 200 so PayPal does not keep retrying.
  return new Response("OK", { status: 200 });
}
