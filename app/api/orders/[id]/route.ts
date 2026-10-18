import { errorResponse, expired } from "@/lib/errors";
import { getOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = getOrder(id);
    if (!order) throw expired();
    return Response.json(order);
  } catch (err) {
    return errorResponse(err);
  }
}
