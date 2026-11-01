import { errorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { createOrder, maybeSweep, type NewLine } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    maybeSweep(); // closes and releases orders open for more than 24 h, at most once a minute
    const { lines } = await readJson<{ lines?: NewLine[] }>(req);
    const order = await createOrder(lines ?? []);
    return Response.json({ orderId: order.orderId });
  } catch (err) {
    return errorResponse(err);
  }
}
