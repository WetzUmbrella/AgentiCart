import { describe, expect, it } from "vitest";
import { checkCatalogue } from "@/lib/catalogue-check";

const product = (over: Record<string, unknown> = {}) => ({
  id: "mic-test",
  category: "microphone",
  brand: "Brand",
  model: "Model",
  variant: "Model",
  price_usd: 99.99,
  price_date: "2026-10-17",
  price_source_url: "https://example.com/price",
  merchant: "merchant_a",
  listing: {},
  spec_file: "specs/mic-test.pdf",
  spec_source_url: "https://example.com/spec",
  spec_download_url: null,
  key_specs: {},
  verified_by_d: true,
  ...over,
});

const without = (field: string) => {
  const p: Record<string, unknown> = product();
  delete p[field];
  return p;
};

const check = (entries: unknown[]) => checkCatalogue(entries, () => true);

describe("catalogue check", () => {
  it("passes a valid catalogue", () => {
    expect(check([product(), product({ id: "mic-other" })])).toEqual({ problems: [], notes: [] });
  });

  describe("missing fields", () => {
    it.each(["brand", "price_usd", "merchant", "spec_file", "verified_by_d"])("flags a product without %s", (field) => {
      const { problems } = check([without(field)]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^mic-test: ${field} `));
    });

    it("labels an entry with no id by its position", () => {
      const { problems } = check([product(), without("id")]);
      expect(problems).toEqual([expect.stringMatching(/^entry 1: id /)]);
    });
  });

  describe("duplicate SKUs", () => {
    it("flags a repeated id once per repeat", () => {
      const { problems } = check([product(), product({ price_usd: 10 }), product({ id: "mic-x" }), product()]);
      expect(problems).toEqual(["DUPLICATE id mic-test", "DUPLICATE id mic-test"]);
    });

    it("rejects an uppercase variant of an existing id", () => {
      const { problems } = check([product(), product({ id: "MIC-TEST" })]);
      expect(problems).toEqual([expect.stringMatching(/^MIC-TEST: id /)]);
    });
  });

  describe("bad price formats", () => {
    it.each([
      ["more than 2 decimals", 99.999, "mic-test: price has more than 2 decimals"],
      ["a string", "99.99", /^mic-test: price_usd /],
      ["zero", 0, /^mic-test: price_usd /],
      ["negative", -5, /^mic-test: price_usd /],
      ["null", null, /^mic-test: price_usd /],
      ["NaN", Number.NaN, /^mic-test: price_usd /],
    ])("flags a price that is %s", (_, price_usd, expected) => {
      const { problems } = check([product({ price_usd })]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(expected);
    });

    it("accepts whole and 1-decimal prices", () => {
      expect(check([product({ price_usd: 100 }), product({ id: "mic-b", price_usd: 12.5 })]).problems).toEqual([]);
    });
  });

  it("reports missing spec files and unverified specs separately", () => {
    const report = checkCatalogue([product({ verified_by_d: false })], () => false);
    expect(report.problems).toEqual(["mic-test: MISSING data/specs/mic-test.pdf  (source: https://example.com/spec)"]);
    expect(report.notes).toEqual(["mic-test: key_specs not yet verified by D against the spec sheet"]);
  });
});
