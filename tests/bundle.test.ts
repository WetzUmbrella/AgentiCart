import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

describe("bundle builder (mock AI)", () => {
  it("builds the demo bundle in a fixed order with one visible rejection", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const b = await buildBundle("Podcast setup for 2 people under $900");
    expect(b.constraints).toMatchObject({ hosts: 2, budget_usd: 900 });
    expect(b.lines.map((l) => l.product.id)).toEqual(["if-2i2-4", "mic-sm58lc", "cable-hosa-hmic010", "stand-psa1", "hp-mdr7506"]);
    expect(b.lines.map((l) => l.qty)).toEqual([1, 2, 2, 2, 2]);
    expect(b.rejected.map((r) => r.product.id)).toEqual(["mic-yeti-orb"]);
    expect(b.total_cents).toBe(86921);
    expect(b.budget_warning).toBeNull();
    expect(JSON.stringify(b)).not.toContain('"key_specs":');
  });

  it("records every product considered, in the order tried", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const { catalogue } = await import("@/lib/catalogue");
    const b = await buildBundle("Podcast setup for 2 people under $900");
    expect(b.search.catalogue_size).toBe(catalogue.length);
    expect(b.search.rule).toMatch(/No paid placement/);
    expect(b.search.steps.map((s) => s.category)).toEqual(["interface", "microphone", "cable", "stand", "headphones"]);
    const outcomes = (category: string) =>
      b.search.steps.find((s) => s.category === category)!.candidates.map((c) => [c.product_id, c.outcome]);
    expect(outcomes("interface")).toEqual([
      ["if-uca202", "filtered_out"],
      ["if-umc22", "filtered_out"],
      ["if-solo-4", "filtered_out"],
      ["if-2i2-4", "picked"],
    ]);
    expect(outcomes("microphone")).toEqual([
      ["mic-yeti-orb", "rejected"],
      ["mic-sm58lc", "picked"],
      ["mic-at2020", "not_tried"],
      ["mic-sm58s", "not_tried"],
      ["mic-podmic-usb", "not_tried"],
    ]);
    // Every catalogue product in a wanted category appears exactly once.
    expect(b.search.steps.flatMap((s) => s.candidates).length).toBe(catalogue.length);
    // Every verdict carries a trust assessment; the first part has nothing to be checked against.
    expect(b.lines[0].verdict?.trust?.level).toBe("not_applicable");
    expect(b.lines.slice(1).every((l) => l.verdict?.trust?.level === "medium")).toBe(true);
  });

  it("warns when over budget", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const b = await buildBundle("Podcast setup for 2 people under $500");
    expect(b.budget_warning).toMatch(/over your \$500 budget/);
  });
});
