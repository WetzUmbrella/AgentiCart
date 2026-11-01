import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_LABELS } from "@/lib/sample-labels";
import type { Line, ShipPhoto } from "@/lib/types";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

const line: Line = {
  line_id: "line-2", product_id: "mic-sm58lc", name: "Shure SM58-LC", merchant: "merchant_b",
  qty: 1, amount_cents: 10900, state: "AUTHORISED",
};
const photo = (id: string): ShipPhoto => ({
  mime: "image/png",
  data: fs.readFileSync(path.join(process.cwd(), "public/demo-labels", `${id}.png`)).toString("base64"),
});

describe("label photo check (mock AI)", () => {
  it("ships a PNG for every sample label", () => {
    for (const s of SAMPLE_LABELS) expect(photo(s.id).data.startsWith("iVBORw0KGgo")).toBe(true);
  });

  it.each([
    ["sm58-lc", "SM58-LC", "CAPTURE"],
    ["sm58-lc", "Shure SM58 LC", "CAPTURE"],
    ["sm58s", "SM58S", "DO_NOT_CAPTURE"],
    ["sm58s", "SM58-LC", "DO_NOT_CAPTURE"],
    ["unreadable", "SM58-LC", "DO_NOT_CAPTURE"],
    ["sm58-lc", "SM-58", "DO_NOT_CAPTURE"],
    ["mdr-7506", "SM58-LC", "DO_NOT_CAPTURE"],
  ])("label %s declared %s -> %s", async (sample, declared, expected) => {
    const { checkShippedModel } = await import("@/lib/ai");
    const v = await checkShippedModel(line, declared, photo(sample), sample);
    expect(v.action).toBe(expected);
    expect(v.mock).toBe(true);
  });

  it("never charges on a photo mock mode can't read", async () => {
    const { checkShippedModel } = await import("@/lib/ai");
    const v = await checkShippedModel(line, "SM58-LC", photo("sm58-lc"));
    expect(v.action).toBe("DO_NOT_CAPTURE");
    expect(v.reason).toMatch(/can't read photos/);
  });
});
