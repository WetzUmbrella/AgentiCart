import raw from "@/data/catalogue.json";
import { z } from "zod";

export const CATEGORIES = ["interface", "microphone", "cable", "stand", "headphones"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(CATEGORIES),
  brand: z.string(),
  model: z.string(),
  variant: z.string(),
  price_usd: z.number().positive(),
  price_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price_source_url: z.string().url(),
  merchant: z.enum(["merchant_a", "merchant_b", "merchant_c"]),
  listing: z.object({ xlr_inputs: z.number().int().min(0).optional() }),
  spec_file: z.string().regex(/^specs\/[a-z0-9-]+\.(pdf|png)$/),
  spec_source_url: z.string().url(),
  spec_download_url: z.string().url().nullable(),
  // Ground truth filled by hand from the spec sheet. Never sent to the AI or the browser.
  key_specs: z.record(z.string(), z.unknown()),
  verified_by_d: z.boolean(),
});

export type Product = z.infer<typeof ProductSchema>;

/** What the browser and the AI prompt are allowed to see. */
export type PublicProduct = Omit<Product, "key_specs" | "verified_by_d">;

export const catalogue: Product[] = z.array(ProductSchema).parse(raw);

const byId = new Map(catalogue.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

export function toPublic(p: Product): PublicProduct {
  const { key_specs, verified_by_d, ...pub } = p;
  return pub;
}

export function productName(p: Pick<Product, "brand" | "variant">): string {
  return `${p.brand} ${p.variant}`;
}
