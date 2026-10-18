import { auditCompatibility } from "@/lib/ai";
import { getProduct } from "@/lib/catalogue";
import { errorResponse, HttpError } from "@/lib/errors";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-audits one row after a Swap: { bundle: [product_id], check: product_id }. */
export async function POST(req: Request) {
  try {
    const { bundle, check } = await readJson<{ bundle?: unknown; check?: unknown }>(req);
    if (!Array.isArray(bundle) || bundle.length > 8 || typeof check !== "string") {
      throw new HttpError(400, "bad_request", { message: "bundle must be up to 8 product ids; check must be a product id" });
    }
    const target = getProduct(check);
    const others = bundle.map((id) => (typeof id === "string" ? getProduct(id) : undefined));
    if (!target || others.some((p) => !p)) throw new HttpError(400, "unknown_product");
    return Response.json(await auditCompatibility(target, others.filter((p) => p!.id !== target.id) as NonNullable<(typeof others)[number]>[]));
  } catch (err) {
    return errorResponse(err);
  }
}
