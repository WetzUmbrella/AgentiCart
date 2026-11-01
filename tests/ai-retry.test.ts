import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", async (importActual) => ({
  ...(await importActual<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

// Message bodies match what the Gemini SDK throws; lib/ai.ts reads the code from the message.
const BODY: Record<number, string> = {
  503: '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  429: '{"error":{"code":429,"message":"Resource has been exhausted.","status":"RESOURCE_EXHAUSTED"}}',
  400: '{"error":{"code":400,"message":"Invalid argument.","status":"INVALID_ARGUMENT"}}',
};
const apiError = (status: number) => Object.assign(new Error(BODY[status]), { status });
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

describe("Gemini retry behaviour (one retry on busy, see error-rulebook D1/D2)", () => {
  it("retries a temporary 503 and then succeeds", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(goal);
    expect(await run()).toMatchObject({ hosts: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after 2 attempts with ai_busy", async () => {
    generateContent.mockRejectedValue(apiError(503));
    expect(await run()).toMatchObject({ status: 503, message: "ai_busy" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 429 and reports ai_rate_limited", async () => {
    generateContent.mockRejectedValue(apiError(429));
    expect(await run()).toMatchObject({ status: 429, message: "ai_rate_limited" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("turns other errors into a 502 ai_error without retrying", async () => {
    generateContent.mockRejectedValue(apiError(400));
    expect(await run()).toMatchObject({ status: 502, message: "ai_error" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
