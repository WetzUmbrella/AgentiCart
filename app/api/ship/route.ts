import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { shipLine, type ShipInput } from "@/lib/orders";
import { MAX_PHOTO_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SHIP_BODY = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 10_000;

export async function POST(req: Request) {
  try {
    // Room for a base64 label photo (up to 1.5 MB decoded) plus the form fields.
    const body = await readJson<Partial<ShipInput>>(req, MAX_SHIP_BODY);
    if (typeof body.orderId !== "string" || typeof body.line_id !== "string" || typeof body.shipped_model !== "string") {
      throw new HttpError(400, "bad_request", { message: "orderId, line_id, shipped_model, tracking_number and photo are required" });
    }
    return Response.json(await shipLine(body as ShipInput));
  } catch (err) {
    return errorResponse(err);
  }
}
