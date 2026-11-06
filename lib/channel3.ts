// Live price and stock for catalogue products from Channel3. Server-side only.
// Rules are fixed by docs/channel3.md; change that file first if a rule changes.
// Channel3 never chooses products: it only prices products we already picked.

import { config } from "./config";
import type { Product } from "./catalogue";

export type LivePrice = {
  price_usd: number;
  source: "live" | "fixed";
  /** Retailer domain of the cheapest valid offer. Only set for live prices. */
  retailer?: string;
  /** ISO timestamp for live prices, the catalogue price_date for fixed ones. */
  checked_at: string;
};

type Offer = {
  domain?: string;
  price?: number | { amount?: number; price?: number; currency?: string };
  availability?: string;
  condition?: string | null;
};
type Listing = { id?: string; offers?: Offer[]; variants?: { id?: string; offers?: Offer[] }[] };

export const TIMEOUT_MS = 3000;
export const CACHE_MS = 10 * 60 * 1000;
/** A failed lookup is retried after a minute, not ten, so a blip doesn't stick. */
export const FAIL_CACHE_MS = 60 * 1000;
export const OUTLIER_RATIO = 0.6;

const cache = new Map<string, { value: LivePrice; expires: number }>();
const inflight = new Map<string, Promise<LivePrice>>();

export function fixedPrice(product: Product): LivePrice {
  return { price_usd: product.price_usd, source: "fixed", checked_at: product.price_date };
}

const amountOf = (o: Offer): number | null => {
  const p = o.price;
  if (typeof p === "number") return p;
  const n = p?.amount ?? p?.price;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const currencyOf = (o: Offer): string | undefined => (typeof o.price === "object" ? o.price?.currency : undefined);

/** Offers for the exact ID we mapped. Variant IDs (the two SM58s) use that variant's offers when present. */
export function offersFor(listing: Listing, id: string): Offer[] {
  const variant = listing.variants?.find((v) => v.id === id && Array.isArray(v.offers));
  return variant?.offers ?? listing.offers ?? [];
}

/** Rules 1 to 3: new, in stock, USD, not under 60% of our fixed price; then the cheapest. */
export function pickOffer(offers: Offer[], fixedUsd: number): { price: number; retailer?: string } | null {
  let best: { price: number; retailer?: string } | null = null;
  for (const o of offers) {
    const price = amountOf(o);
    if (price === null || price <= 0) continue;
    if (o.condition !== "new" || o.availability !== "InStock" || currencyOf(o) !== "USD") continue;
    if (price < fixedUsd * OUTLIER_RATIO) continue;
    if (!best || price < best.price) best = { price, retailer: o.domain };
  }
  return best && { price: Math.round(best.price * 100) / 100, retailer: best.retailer };
}

async function lookup(product: Product, id: string, key: string): Promise<LivePrice> {
  const res = await fetch(`${config.channel3Base}/products/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`channel3_http_${res.status}`);
  const best = pickOffer(offersFor((await res.json()) as Listing, id), product.price_usd);
  if (!best) throw new Error("channel3_no_valid_offer");
  return { price_usd: best.price, source: "live", retailer: best.retailer, checked_at: new Date().toISOString() };
}

/**
 * The price to show and charge for one product. Never throws: anything that goes wrong
 * (switch off, no ID, no key, HTTP error, timeout, no valid offer) gives the fixed price.
 */
export async function livePrice(product: Product): Promise<LivePrice> {
  const id = product.channel3_id;
  const key = config.channel3Key;
  if (!config.livePrices || !id || !key) return fixedPrice(product);

  const hit = cache.get(product.id);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = inflight.get(product.id);
  if (pending) return pending;

  const p = lookup(product, id, key)
    .then((value) => {
      cache.set(product.id, { value, expires: Date.now() + CACHE_MS });
      return value;
    })
    .catch((err: unknown) => {
      console.warn(`[channel3] ${product.id}: ${err instanceof Error ? err.message : String(err)}; using fixed price`);
      const value = fixedPrice(product);
      cache.set(product.id, { value, expires: Date.now() + FAIL_CACHE_MS });
      return value;
    })
    .finally(() => inflight.delete(product.id));
  inflight.set(product.id, p);
  return p;
}

/** Prices for several products at once, keyed by product id. Lookups run in parallel. */
export async function livePrices(products: Product[]): Promise<Map<string, LivePrice>> {
  const entries = await Promise.all(products.map(async (p) => [p.id, await livePrice(p)] as const));
  return new Map(entries);
}

/** Tests only. */
export function _resetChannel3Cache(): void {
  cache.clear();
  inflight.clear();
}
