import { errorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { createOrder, type NewLine } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { lines } = await readJson<{ lines?: NewLine[] }>(req);
    const order = await createOrder(lines ?? []);
    return Response.json({ orderId: order.orderId });
  } catch (err) {
    return errorResponse(err);
  }
}
