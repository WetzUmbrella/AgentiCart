import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

describe("bundle builder (mock AI)", () => {
  it("builds the demo bundle in a fixed order with two visible rejections", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const b = await buildBundle("Podcast setup for 2 people under $900");
    expect(b.constraints).toMatchObject({ hosts: 2, budget_usd: 900 });
    expect(b.lines.map((l) => l.product.id)).toEqual(["if-2i2-4", "mic-sm58lc", "cable-hosa-hmic010", "stand-compass", "hp-mdr7506"]);
    expect(b.lines.map((l) => l.qty)).toEqual([1, 2, 2, 2, 2]);
    expect(b.rejected.map((r) => r.product.id)).toEqual(["mic-yeti-orb", "stand-psa1"]);
    expect(b.total_cents).toBe(87119);
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
      ["if-mtrack-solo", "filtered_out"],
      ["if-umc22", "filtered_out"],
      ["if-solo-4", "filtered_out"],
      ["if-2i2-4", "picked"],
    ]);
    expect(outcomes("microphone")).toEqual([
      ["mic-yeti-orb", "rejected"],
      ["mic-sm58lc", "picked"],
      ["mic-at2020", "not_tried"],
      ["mic-sm58s", "not_tried"],
      ["mic-at2035", "not_tried"],
      ["mic-podmic-usb", "not_tried"],
      ["mic-sm7b", "not_tried"],
    ]);
    // PSA1 is 3/8 inch only; the SM58-LC is 5/8 inch with no adapter in its box (testset t17).
    expect(outcomes("stand")).toEqual([
      ["stand-psa1", "rejected"],
      ["stand-compass", "picked"],
      ["stand-elgato-lp", "not_tried"],
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

describe("bundle progress", () => {
  it("reports the goal, each audit and each settled category, in order", async () => {
    const { buildBundle } = await import("@/lib/bundle");
    const events: import("@/lib/types").BundleProgress[] = [];
    const b = await buildBundle("Podcast setup for 2 people under $900", (e) => events.push(e));
    expect(events[0]).toMatchObject({ type: "goal", categories: ["interface", "microphone", "cable", "stand", "headphones"] });
    const steps = events.filter((e) => e.type === "step");
    expect(steps.map((e) => e.step.category)).toEqual(b.search.steps.map((s) => s.category));
    expect(steps.every((e) => e.picked)).toBe(true); // the demo goal fills every category
    const checks = events.filter((e) => e.type === "checking");
    expect(checks.length).toBe(b.lines.length + b.rejected.length);
    // The microphone is checked against the interface already picked.
    expect(checks.find((e) => e.category === "microphone")?.against).toHaveLength(1);
  });
});

describe("POST /api/bundle?stream=1", () => {
  it("streams NDJSON progress and ends with the same bundle as the plain reply", async () => {
    const { POST } = await import("@/app/api/bundle/route");
    const req = (q: string) =>
      new Request(`http://x/api/bundle${q}`, { method: "POST", body: JSON.stringify({ goal: "Podcast setup for 2 people under $900" }) });
    const plain = await (await POST(req(""))).json();
    const res = await POST(req("?stream=1"));
    expect(res.headers.get("Content-Type")).toMatch(/ndjson/);
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.at(-1)).toEqual({ type: "done", bundle: plain });
    expect(events.some((e) => e.type === "checking")).toBe(true);
  });

  it("rejects a bad goal before streaming", async () => {
    const { POST } = await import("@/app/api/bundle/route");
    const res = await POST(new Request("http://x/api/bundle?stream=1", { method: "POST", body: JSON.stringify({ goal: "x" }) }));
    expect(res.status).toBe(400);
  });
});
