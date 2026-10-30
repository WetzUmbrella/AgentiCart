import { describe, expect, it } from "vitest";
import { aiError } from "@/lib/ai";

// Real error bodies seen from the Gemini API on 30 Oct 2026 (trimmed).
describe("aiError", () => {
  it("maps a server deadline to a timeout", () => {
    const e = aiError(new Error('{"error":{"code":504,"message":"Deadline expired before operation could complete.","status":"DEADLINE_EXCEEDED"}}'));
    expect(e).toMatchObject({ status: 504, message: "ai_timeout" });
  });

  it("explains the free-tier quota of 0 for Pro", () => {
    const e = aiError(new Error('{"error":{"code":429,"message":"You exceeded your current quota... Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0"}}'));
    expect(e).toMatchObject({ status: 429, message: "ai_rate_limited" });
    expect(String(e.extra.message)).toMatch(/free tier/);
  });

  it("maps high demand to busy", () => {
    const e = aiError(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'));
    expect(e).toMatchObject({ status: 503, message: "ai_busy" });
  });

  it("keeps anything else as a short 502", () => {
    const e = aiError(new Error('{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users."}}'));
    expect(e).toMatchObject({ status: 502, message: "ai_error" });
  });
});
