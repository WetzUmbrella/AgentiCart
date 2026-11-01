import { errorResponse, expired, HttpError } from "@/lib/errors";
import { getOrder, getPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The label photo a line was charged (or not charged) on. Same access as the order itself. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; line: string }> }) {
  try {
    const { id, line } = await ctx.params;
    if (!getOrder(id)) throw expired();
    const photo = getPhoto(id, line);
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
