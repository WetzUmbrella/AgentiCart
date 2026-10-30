import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", async (importActual) => ({
  ...(await importActual<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const apiError = (status: number) => Object.assign(new Error(`status ${status}`), { status });
const goal = { text: JSON.stringify({ hosts: 1, budget_usd: null, categories_needed: ["microphone"] }) };

beforeAll(() => {
  process.env.AI_MODE = "live";
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODEL_FLASH = "test-flash";
});

beforeEach(() => {
  vi.useFakeTimers();
  generateContent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function run() {
  const { parseGoal, _resetAiState } = await import("@/lib/ai");
  _resetAiState();
  const result = parseGoal("one mic").catch((err: unknown) => err);
  await vi.runAllTimersAsync();
  return result;
}

describe("Gemini error handling", () => {
  it("retries a temporary 503 and then succeeds", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(goal);
    expect(await run()).toMatchObject({ hosts: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts with ai_busy", async () => {
    generateContent.mockRejectedValue(apiError(503));
    expect(await run()).toMatchObject({ status: 503, message: "ai_busy" });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 429 and reports ai_quota", async () => {
    generateContent.mockRejectedValue(apiError(429));
    expect(await run()).toMatchObject({ status: 503, message: "ai_quota" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("passes other errors through unchanged", async () => {
    generateContent.mockRejectedValue(apiError(400));
    expect(await run()).toMatchObject({ status: 400, message: "status 400" });
  });
});
