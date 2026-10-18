import { errorResponse } from "@/lib/errors";
import { closeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = await closeOrder(id);
    return Response.json({ voided: true, released_cents: order.released_cents ?? 0, order });
  } catch (err) {
    return errorResponse(err);
  }
}
