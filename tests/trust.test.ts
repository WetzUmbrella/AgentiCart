import { describe, expect, it } from "vitest";
import { getProduct, type Product } from "@/lib/catalogue";
import { assessVerdict, quoteInText } from "@/lib/trust";
import type { AuditVerdict } from "@/lib/types";

const product = (id: string, verified = false): Product => ({ ...getProduct(id)!, verified_by_d: verified });
const iface = (v = false) => product("if-2i2-4", v);
const sm58 = (v = false) => product("mic-sm58lc", v);
const yeti = (v = false) => product("mic-yeti-orb", v);

const verdict = (over: Partial<AuditVerdict> = {}): AuditVerdict => ({
  product_id: "mic-sm58lc",
  compatible: true,
  confidence: "high",
  reason: "XLR mic into an XLR input.",
  evidence: [{ product_id: "mic-sm58lc", quote: "3-pin XLR male" }],
  ...over,
});

/** Spec text keyed by product id; null means an image sheet (cannot be text-checked). */
const reader = (texts: Record<string, string | null>) => async (p: Product) => texts[p.id] ?? null;

describe("quoteInText", () => {
  it("ignores case, punctuation, line breaks and dash styles", () => {
    expect(quoteInText("Output:\n3‑pin   XLR-male connector.", "3-pin XLR male")).toBe(true);
    expect(quoteInText("Requires 48V phantom power", "needs 48V phantom power")).toBe(false);
    expect(quoteInText("anything", "  ")).toBe(false);
    expect(quoteInText("sound rein-\nforcement and studio", "sound reinforcement and studio")).toBe(true);
    expect(quoteInText("3-pin XLR-\nmale", "XLR-male")).toBe(true);
  });
});

describe("assessVerdict", () => {
  it("is high only when every quote is found and hand-checked data agrees", async () => {
    const v = await assessVerdict(verdict(), sm58(true), [iface(true)], reader({ "mic-sm58lc": "Connector: 3-pin XLR male" }));
    expect(v.evidence[0]).toMatchObject({ quote_check: "found", source_url: getProduct("mic-sm58lc")!.spec_source_url });
    expect(v.trust?.level).toBe("high");
  });

  it("is low when a quote is not in the spec sheet, whatever the AI rated itself", async () => {
    const v = await assessVerdict(verdict(), sm58(true), [iface(true)], reader({ "mic-sm58lc": "Cardioid dynamic" }));
    expect(v.evidence[0].quote_check).toBe("not_found");
    expect(v.trust?.level).toBe("low");
  });

  it("is low when the AI disagrees with the hand-checked rules", async () => {
    const v = await assessVerdict(
      verdict({ product_id: "mic-yeti-orb", evidence: [{ product_id: "mic-yeti-orb", quote: "USB-C" }] }),
      yeti(true),
      [iface(true)],
      reader({ "mic-yeti-orb": "Connector: USB-C" }),
    );
    expect(v.trust?.signals.find((s) => s.key === "hand_checked")?.status).toBe("bad");
    expect(v.trust?.level).toBe("low");
  });

  it("stays medium when quotes can't be checked or parts aren't hand-checked yet", async () => {
    const image = await assessVerdict(verdict(), sm58(true), [iface(true)], reader({}));
    expect(image.evidence[0].quote_check).toBe("unchecked");
    expect(image.trust?.level).toBe("medium");
    const unverified = await assessVerdict(verdict(), sm58(), [iface()], reader({ "mic-sm58lc": "3-pin XLR male" }));
    expect(unverified.trust?.level).toBe("medium");
  });

  it("treats a quote from a product outside the check, or no quote at all, as a failure", async () => {
    const stray = await assessVerdict(
      verdict({ evidence: [{ product_id: "hp-mdr7506", quote: "3-pin XLR male" }] }),
      sm58(),
      [iface()],
      reader({ "hp-mdr7506": "3-pin XLR male" }),
    );
    expect(stray.evidence[0].quote_check).toBe("not_found");
    expect(stray.trust?.level).toBe("low");
    const none = await assessVerdict(verdict({ evidence: [] }), sm58(), [iface()], reader({}));
    expect(none.trust?.level).toBe("low");
  });

  it("lets a low self-rating lower the level but a high one never raises it", async () => {
    const v = await assessVerdict(verdict({ confidence: "low" }), sm58(true), [iface(true)], reader({ "mic-sm58lc": "3-pin XLR male" }));
    expect(v.trust?.level).toBe("low");
  });

  it("never checks mock quotes and has no level for the first part", async () => {
    const mock = await assessVerdict(verdict({ mock: true }), sm58(true), [iface(true)], reader({ "mic-sm58lc": "3-pin XLR male" }));
    expect(mock.evidence[0].quote_check).toBe("unchecked");
    expect(mock.trust?.level).toBe("medium");
    const first = await assessVerdict(verdict({ evidence: [] }), iface(), [], reader({}));
    expect(first.trust).toMatchObject({ level: "not_applicable", signals: [] });
  });
});
