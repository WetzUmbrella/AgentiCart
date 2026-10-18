import { buildBundle } from "@/lib/bundle";
import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { goal } = await readJson<{ goal?: string }>(req);
    if (typeof goal !== "string" || goal.trim().length < 3 || goal.length > 300) {
      throw new HttpError(400, "bad_goal", { message: "Describe your setup in 3 to 300 characters." });
    }
    return Response.json(await buildBundle(goal.trim()));
  } catch (err) {
    return errorResponse(err);
  }
}
