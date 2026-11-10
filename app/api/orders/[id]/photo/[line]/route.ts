import { errorResponse, expired, HttpError } from "@/lib/errors";
import { getOrder, getPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The label photo a line was charged (or not charged) on. Same access as the order itself.
 * ?n=<photo number> picks an earlier check's photo (D5); without it, the latest photo.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; line: string }> }) {
  try {
    const { id, line } = await ctx.params;
    const order = getOrder(id);
    if (!order) throw expired();
    const latest = order.lines.find((l) => l.line_id === line)?.photo_count ?? 0;
    const asked = new URL(req.url).searchParams.get("n");
    const n = asked === null ? latest : Number(asked);
    const photo = Number.isInteger(n) && n >= 1 ? getPhoto(id, line, n) : undefined;
    if (!photo) throw new HttpError(404, "no_photo");
    return new Response(Buffer.from(photo.data, "base64"), {
      headers: {
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
