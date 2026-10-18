import { catalogue, toPublic } from "@/lib/catalogue";

// Public product data for Swap. key_specs (test ground truth) is stripped.
export function GET() {
  return Response.json(catalogue.map(toPublic));
}
