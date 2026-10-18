import { errorResponse } from "@/lib/errors";
import { authorizeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = await authorizeOrder(id);
    return Response.json({
      status: order.status,
      authorizations: order.lines.map((l) => ({ line_id: l.line_id, auth_id: l.auth_id ?? null, amount_cents: l.amount_cents })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
