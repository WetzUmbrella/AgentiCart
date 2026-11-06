import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProduct, type Product } from "@/lib/catalogue";
import { _resetChannel3Cache, CACHE_MS, FAIL_CACHE_MS, livePrice, livePrices, pickOffer } from "@/lib/channel3";

const product = (id: string): Product => {
  const p = getProduct(id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};
const sm7b = product("mic-sm7b");
const sm58s = product("mic-sm58s");
const psa1 = product("stand-psa1");

type O = { domain?: string; amount?: number; currency?: string; availability?: string; condition?: string | null };
const offer = ({ domain = "shop.com", amount = 400, currency = "USD", availability = "InStock", condition = "new" }: O = {}) => ({
  domain, availability, condition, price: { amount, currency },
});
const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  _resetChannel3Cache();
  vi.stubEnv("LIVE_PRICES", "1");
  vi.stubEnv("CHANNEL3_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("pickOffer (price rules 1 to 3)", () => {
  it("takes the cheapest new, in-stock USD offer", () => {
    const best = pickOffer([offer({ domain: "a.com", amount: 449 }), offer({ domain: "b.com", amount: 439 })], 399);
    expect(best).toEqual({ price: 439, retailer: "b.com" });
  });

  it("ignores used, null-condition, out-of-stock and non-USD offers", () => {
    const best = pickOffer(
      [
        offer({ amount: 300, condition: "used" }),
        offer({ amount: 310, condition: null }),
        offer({ amount: 320, availability: "OutOfStock" }),
        offer({ amount: 330, currency: "CAD" }),
        offer({ domain: "ok.com", amount: 450 }),
      ],
      399,
    );
    expect(best).toEqual({ price: 450, retailer: "ok.com" });
  });

  it("drops offers under 60% of our fixed price (the $199 SM7B)", () => {
    expect(pickOffer([offer({ domain: "kohls.com", amount: 199 }), offer({ amount: 439 })], 399)?.price).toBe(439);
    expect(pickOffer([offer({ amount: 199 })], 399)).toBeNull();
  });

  it("reads price.price as well as price.amount", () => {
    expect(pickOffer([{ domain: "x.com", availability: "InStock", condition: "new", price: { price: 101.5, currency: "USD" } }], 100))
      .toEqual({ price: 101.5, retailer: "x.com" });
  });
});

describe("livePrice", () => {
  it("returns a live price with retailer and time", async () => {
    const fetchMock = respond({ id: sm7b.channel3_id, offers: [offer({ domain: "sweetwater.com", amount: 439 })] });
    vi.stubGlobal("fetch", fetchMock);
    const p = await livePrice(sm7b);
    expect(p).toMatchObject({ price_usd: 439, source: "live", retailer: "sweetwater.com" });
    expect(Number.isNaN(Date.parse(p.checked_at))).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.trychannel3.com/v1/products/${sm7b.channel3_id}`);
    expect(init.headers).toEqual({ "x-api-key": "test-key" });
  });

  it("uses the mapped variant's offers for the SM58S", async () => {
    vi.stubGlobal("fetch", respond({
      id: "parent",
      offers: [offer({ amount: 99 })],
      variants: [{ id: "a8ibawf", offers: [offer({ amount: 99 })] }, { id: sm58s.channel3_id, offers: [offer({ domain: "v.com", amount: 109 })] }],
    }));
    expect(await livePrice(sm58s)).toMatchObject({ price_usd: 109, retailer: "v.com" });
  });

  it("with LIVE_PRICES=0 never calls Channel3 and keeps the fixed price", async () => {
    vi.stubEnv("LIVE_PRICES", "0");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await livePrice(sm7b)).toEqual({ price_usd: sm7b.price_usd, source: "fixed", checked_at: sm7b.price_date });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back with no channel3_id (PSA1) or no API key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await livePrice(psa1)).source).toBe("fixed");
    vi.stubEnv("CHANNEL3_API_KEY", "");
    expect((await livePrice(sm7b)).source).toBe("fixed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back on an HTTP error, a network error or no valid offer", async () => {
    vi.stubGlobal("fetch", respond({ error: "bad key" }, 401));
    expect(await livePrice(sm7b)).toEqual({ price_usd: sm7b.price_usd, source: "fixed", checked_at: sm7b.price_date });
    _resetChannel3Cache();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await livePrice(sm7b)).source).toBe("fixed");
    _resetChannel3Cache();
    vi.stubGlobal("fetch", respond({ offers: [offer({ availability: "OutOfStock" })] }));
    expect((await livePrice(sm7b)).source).toBe("fixed");
  });

  it("falls back after the 3 s timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })));
    const t0 = Date.now();
    const p = await livePrice(sm7b);
    expect(p.source).toBe("fixed");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
  }, 6000);

  it("caches a live price for 10 minutes and a fallback for 1 minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const ok = respond({ offers: [offer({ amount: 439 })] });
    vi.stubGlobal("fetch", ok);
    await livePrice(sm7b);
    await livePrice(sm7b);
    expect(ok).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + CACHE_MS + 1);
    await livePrice(sm7b);
    expect(ok).toHaveBeenCalledTimes(2);

    _resetChannel3Cache();
    const bad = respond({}, 500);
    vi.stubGlobal("fetch", bad);
    await livePrice(sm7b);
    await livePrice(sm7b);
    expect(bad).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + FAIL_CACHE_MS + 1);
    await livePrice(sm7b);
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("shares one lookup between concurrent calls", async () => {
    const fetchMock = respond({ offers: [offer({ amount: 439 })] });
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([livePrice(sm7b), livePrice(sm7b)]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("livePrices prices several products keyed by id", async () => {
    vi.stubGlobal("fetch", respond({ offers: [offer({ amount: 439 })] }));
    const map = await livePrices([sm7b, psa1]);
    expect(map.get(sm7b.id)?.source).toBe("live");
    expect(map.get(psa1.id)?.source).toBe("fixed");
  });
});
