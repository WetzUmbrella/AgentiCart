import { buildBundle } from "@/lib/bundle";
import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/bundle { goal } -> BundleResponse.
 * With ?stream=1 the reply is NDJSON: progress events ({ type: "goal" | "checking" | "step" }), then
 * one { type: "done", bundle } or { type: "error", status, error, message }. A live build takes about
 * a minute, so the shopper sees each part being checked instead of a spinner.
 */
export async function POST(req: Request) {
  let goal: string;
  try {
    const body = await readJson<{ goal?: string }>(req);
    if (typeof body.goal !== "string" || body.goal.trim().length < 3 || body.goal.length > 300) {
      throw new HttpError(400, "bad_goal", { message: "Describe your setup in 3 to 300 characters." });
    }
    goal = body.goal.trim();
  } catch (err) {
    return errorResponse(err);
  }

  if (new URL(req.url).searchParams.get("stream") !== "1") {
    try {
      return Response.json(await buildBundle(goal));
    } catch (err) {
      return errorResponse(err);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const bundle = await buildBundle(goal, send);
        send({ type: "done", bundle });
      } catch (err) {
        // Same codes and messages as the non-streamed reply.
        const res = errorResponse(err);
        send({ type: "error", status: res.status, ...(await res.json()) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
