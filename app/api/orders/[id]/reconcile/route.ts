import { errorResponse, expired } from "@/lib/errors";
import { getPayPal } from "@/lib/paypal";
import { reconcileWithPayPal } from "@/lib/reconcile";
import { getOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/:id/reconcile
 * Read-only proof for one order: held = charged + released + still held + unknown, checked against
 * our record and PayPal's. Never moves money and never changes the order, so it is safe to call any time.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = getOrder(id);
    if (!order) throw expired();
    const paypal = getPayPal();
    return Response.json(await reconcileWithPayPal(order, { getOrder: paypal.getOrder, getAuthorization: paypal.getAuthorization }));
  } catch (err) {
    return errorResponse(err);
  }
}
