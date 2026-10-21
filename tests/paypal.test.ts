import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTokenCache, PayPalError, ppTiming, restPayPal } from "@/lib/paypal";
import { errorResponse } from "@/lib/errors";

// Exercises the real REST client against a fake fetch, so no PayPal account is needed.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Reply = Response | Error;

function fakeFetch(apiReplies: Reply[]) {
  const calls: { url: string; requestId: string | null }[] = [];
  let tokenCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/v1/oauth2/token")) {
        tokenCalls++;
        return json(200, { access_token: `T${tokenCalls}`, expires_in: 3600 });
      }
      calls.push({ url: u, requestId: new Headers(init?.headers).get("PayPal-Request-Id") });
      const next = apiReplies.shift();
      if (!next) throw new Error("test ran out of fake replies");
      if (next instanceof Error) throw next;
      return next;
    }),
  );
  return { calls, tokenCalls: () => tokenCalls };
}

const COMPLETED = () => json(201, { id: "CAP1", status: "COMPLETED" });

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  ppTiming.retryDelayMs = 0;
  clearTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PayPal client retries (risk R-P1)", () => {
  it("retries a timed-out capture once, with the SAME request ID", async () => {
    const f = fakeFetch([new Error("The operation was aborted due to timeout"), COMPLETED()]);
    const cap = await restPayPal.captureAuthorization("AUTH1", 21800, false, "cap-ORDER1-line-2");
    expect(cap.status).toBe("COMPLETED");
    expect(f.calls).toHaveLength(2);
    expect(f.calls.map((c) => c.requestId)).toEqual(["cap-ORDER1-line-2", "cap-ORDER1-line-2"]);
  });

  it("retries a PayPal 503 once", async () => {
    const f = fakeFetch([json(503, { name: "SERVICE_UNAVAILABLE" }), COMPLETED()]);
    await restPayPal.captureAuthorization("AUTH1", 100, false, "cap-x");
    expect(f.calls).toHaveLength(2);
  });

  it("does not retry a clear refusal (422)", async () => {
    const f = fakeFetch([json(422, { details: [{ issue: "AUTHORIZATION_VOIDED" }] })]);
    const err = await restPayPal.captureAuthorization("AUTH1", 100, false, "cap-x").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.issue).toBe("AUTHORIZATION_VOIDED");
    expect(f.calls).toHaveLength(1);
  });

  it("gives up after one retry and reports 'no response' as status 0", async () => {
    const f = fakeFetch([new Error("ECONNRESET"), new Error("ECONNRESET")]);
    const err = await restPayPal.captureAuthorization("AUTH1", 100, false, "cap-x").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.status).toBe(0);
    expect(f.calls).toHaveLength(2);
  });

  it("never repeats a POST that has no request ID", async () => {
    process.env.PAYPAL_WEBHOOK_ID = "WH1";
    const f = fakeFetch([json(503, {})]);
    await expect(restPayPal.verifyWebhook(new Headers(), "{}")).rejects.toBeInstanceOf(PayPalError);
    expect(f.calls).toHaveLength(1);
  });

  it("gets a fresh token once when PayPal says 401", async () => {
    const f = fakeFetch([json(401, { error: "invalid_token" }), COMPLETED()]);
    await restPayPal.captureAuthorization("AUTH1", 100, false, "cap-x");
    expect(f.tokenCalls()).toBe(2);
    expect(f.calls).toHaveLength(2);
  });
});

describe("PayPal errors reach the browser as a clear 502", () => {
  it("passes PayPal's issue code through", async () => {
    const res = errorResponse(new PayPalError(422, JSON.stringify({ details: [{ issue: "ORDER_NOT_APPROVED" }] }), "POST x"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("paypal_error");
    expect(body.issue).toBe("ORDER_NOT_APPROVED");
  });

  it("says 'no response' when PayPal never answered", async () => {
    const body = await errorResponse(new PayPalError(0, "timeout", "POST x")).json();
    expect(body.issue).toBe("no response");
  });
});
