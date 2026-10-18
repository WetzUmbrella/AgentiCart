import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { shipLine, type ShipInput } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<ShipInput>>(req);
    if (typeof body.orderId !== "string" || typeof body.line_id !== "string" || typeof body.shipped_model !== "string") {
      throw new HttpError(400, "bad_request", { message: "orderId, line_id, shipped_model and tracking_number are required" });
    }
    return Response.json(await shipLine(body as ShipInput));
  } catch (err) {
    return errorResponse(err);
  }
}
