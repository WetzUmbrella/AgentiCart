import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { cancelLine, type CancelInput } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Merchant console "Can't fulfil" button: { orderId, line_id, reason? } -> { line }.
 * Only an AUTHORISED (held, not yet packed) line can be cancelled; it is never charged.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<CancelInput>>(req);
    if (typeof body.orderId !== "string" || typeof body.line_id !== "string") {
      throw new HttpError(400, "bad_request", { message: "orderId and line_id are required" });
    }
    return Response.json(cancelLine(body as CancelInput));
  } catch (err) {
    return errorResponse(err);
  }
}
