import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/catalogue";
import { ruleCheck } from "@/lib/rules";

const p = (id: string) => {
  const product = getProduct(id);
  if (!product) throw new Error(`unknown product ${id}`);
  return product;
};

describe("mount thread rule (mic and stand)", () => {
  it("rejects a 3/8 inch stand for a 5/8 inch mic with no adapter in either box", () => {
    const r = ruleCheck(p("stand-psa1"), [p("mic-sm58lc")]);
    expect(r).toMatchObject({ compatible: false, problem: { product_id: "stand-psa1", field: "mount_thread" } });
  });

  it("accepts a stand whose own adapter bridges the gap", () => {
    expect(ruleCheck(p("stand-compass"), [p("mic-sm58lc")])).toEqual({ compatible: true });
  });

  it("accepts a mic whose included adapter fits the stand", () => {
    expect(ruleCheck(p("stand-psa1"), [p("mic-at2020")])).toEqual({ compatible: true });
  });

  it("rejects a 1/4 inch mic on a stand with only 5/8 and 3/8 options (testset t18)", () => {
    expect(ruleCheck(p("stand-compass"), [p("mic-yeti-orb")])?.compatible).toBe(false);
  });

  it("has no opinion when the mic has no mount thread on file", () => {
    expect(ruleCheck(p("stand-psa1"), [p("mic-podmic-usb")])).toBeNull();
  });

  it("still applies the interface rules", () => {
    expect(ruleCheck(p("mic-yeti-orb"), [p("if-2i2-4")])?.compatible).toBe(false);
    expect(ruleCheck(p("mic-sm58lc"), [p("if-2i2-4")])).toEqual({ compatible: true });
  });
});
