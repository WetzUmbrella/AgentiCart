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

  it("warns when over budget", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const b = await buildBundle("Podcast setup for 2 people under $500");
    expect(b.budget_warning).toMatch(/over your \$500 budget/);
  });
});
