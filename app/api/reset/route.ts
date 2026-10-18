import { errorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { resetOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Clears ONE order. There is deliberately no "clear everything" on the public site. */
export async function POST(req: Request) {
  try {
    const { orderId } = await readJson<{ orderId?: string }>(req);
    const cleared = typeof orderId === "string" ? resetOrder(orderId) : false;
    return Response.json({ cleared });
  } catch (err) {
    return errorResponse(err);
  }
}
