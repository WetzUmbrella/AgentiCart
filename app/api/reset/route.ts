import { errorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { resetOrderSafely } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Clears ONE order. There is deliberately no "clear everything" on the public site.
 * The hold is released first; if PayPal cannot confirm that, the order is kept for the
 * 24 h auto-close instead of being forgotten with money still held (risk R-S2).
 */
export async function POST(req: Request) {
  try {
    const { orderId } = await readJson<{ orderId?: string }>(req);
    const result = typeof orderId === "string" ? await resetOrderSafely(orderId) : { cleared: false };
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
