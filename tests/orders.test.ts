import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeOrder,
  cancelLine,
  closeOrder,
  createOrder,
  resetOrderSafely,
  shipLine,
  sweepStale,
  type Deps,
} from "@/lib/orders";
import { mockPayPal, mockCapturedCents, mockIsVoided } from "@/lib/paypal-mock";
import { PayPalError } from "@/lib/paypal";
import { orders, pruneOld, resetOrder } from "@/lib/store";
import type { Line, ShipVerdict } from "@/lib/types";

function exactStub(line: Line, shipped: string): Promise<ShipVerdict> {
  const ok = shipped === "SM58-LC";
  return Promise.resolve({
    line_id: "ignored-by-code",
    match: ok,
    matched_variant: ok ? "SM58-LC" : null,
    reason: ok ? "match" : "different variant",
    action: ok ? "CAPTURE" : "DO_NOT_CAPTURE",
  });
}

function makeDeps(over: Partial<Deps> = {}): Deps {
  return { paypal: { ...mockPayPal }, checkShipped: exactStub, ...over };
}

const LINES = [
  { line_id: "line-1", product_id: "if-2i2-4", qty: 1 },
  { line_id: "line-2", product_id: "mic-sm58lc", qty: 2 },
  { line_id: "line-3", product_id: "hp-mdr7506", qty: 2 },
];

async function authorised(deps: Deps) {
  const o = await createOrder(LINES, deps);
  await authorizeOrder(o.orderId, deps);
  return o.orderId;
}

const ship = (orderId: string, line_id: string, shipped_model: string, deps: Deps) =>
  shipLine({ orderId, line_id, shipped_model, tracking_number: "DEMO123" }, deps);

beforeEach(() => orders.clear());

describe("create and authorise", () => {
  it("prices lines from the catalogue in cents and authorises every line", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = orders.get(id)!;
    expect(o.status).toBe("AUTHORISED");
    expect(o.lines.map((l) => l.amount_cents)).toEqual([22499, 21800, 19600]);
    expect(o.lines.every((l) => l.state === "AUTHORISED" && l.auth_id)).toBe(true);
  });

  it("rejects unknown products, bad qty and too many lines", async () => {
    const deps = makeDeps();
    await expect(createOrder([{ line_id: "line-1", product_id: "nope", qty: 1 }], deps)).rejects.toMatchObject({ status: 400 });
    await expect(createOrder([{ line_id: "line-1", product_id: "mic-sm58lc", qty: 6 }], deps)).rejects.toMatchObject({ status: 400 });
    const nine = Array.from({ length: 9 }, (_, i) => ({ line_id: `line-${i + 1}`, product_id: "mic-sm58lc", qty: 1 }));
    await expect(createOrder(nine, deps)).rejects.toMatchObject({ status: 400 });
  });

  it("authorising twice is harmless", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const before = orders.get(id)!.lines.map((l) => l.auth_id);
    await authorizeOrder(id, deps);
    expect(orders.get(id)!.lines.map((l) => l.auth_id)).toEqual(before);
  });
});

describe("ship", () => {
  it("captures a matching line and records tracking", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.captured).toBe(true);
    expect(r.line.state).toBe("CAPTURED");
    expect(r.line.tracking_number).toBe("DEMO123");
    expect(r.verdict.line_id).toBe("line-2"); // set by code, not the model
    expect(mockCapturedCents(r.line.auth_id!)).toBe(21800);
  });

  it("never calls PayPal for a mismatch", async () => {
    const capture = vi.fn(mockPayPal.captureAuthorization);
    const deps = makeDeps({ paypal: { ...mockPayPal, captureAuthorization: capture } });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58S", deps);
    expect(r.captured).toBe(false);
    expect(r.line.state).toBe("NOT_CHARGED");
    expect(capture).not.toHaveBeenCalled();
  });

  it("refuses to ship a line twice (no double charge)", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    await expect(ship(id, "line-2", "SM58-LC", deps)).rejects.toMatchObject({ status: 409 });
    expect(mockCapturedCents(orders.get(id)!.lines[1].auth_id!)).toBe(21800);
  });

  it("refuses to charge a NOT_CHARGED line later", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58S", deps);
    await expect(ship(id, "line-2", "SM58-LC", deps)).rejects.toMatchObject({ status: 409 });
  });

  it("blocks a concurrent second click while the first check is running", async () => {
    let release!: () => void;
    const slow: Deps["checkShipped"] = (l, s) => new Promise((res) => (release = () => res(exactStub(l, s))));
    const deps = makeDeps({ checkShipped: slow });
    const id = await authorised(deps);
    const first = ship(id, "line-2", "SM58-LC", deps);
    await expect(ship(id, "line-2", "SM58-LC", deps)).rejects.toMatchObject({ status: 409 });
    release();
    expect((await first).captured).toBe(true);
  });

  it("returns the line to AUTHORISED when the AI fails", async () => {
    const deps = makeDeps({ checkShipped: () => Promise.reject(new Error("timeout")) });
    const id = await authorised(deps);
    await expect(ship(id, "line-2", "SM58-LC", deps)).rejects.toMatchObject({ status: 502 });
    expect(orders.get(id)!.lines[1].state).toBe("AUTHORISED");
  });

  it("marks CAPTURE_FAILED when PayPal does not complete the capture", async () => {
    const deps = makeDeps({
      paypal: { ...mockPayPal, captureAuthorization: async () => ({ id: "CAPX", status: "DECLINED" }) },
    });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.captured).toBe(false);
    expect(r.line.state).toBe("CAPTURE_FAILED");
  });

  it("keeps CAPTURED when tracking fails", async () => {
    const deps = makeDeps({
      paypal: { ...mockPayPal, addTracking: async () => Promise.reject(new Error("tracking down")) },
    });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.line.state).toBe("CAPTURED");
  });

  it("rejects bad tracking numbers before claiming the line", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await expect(shipLine({ orderId: id, line_id: "line-2", shipped_model: "SM58-LC", tracking_number: "<script>" }, deps))
      .rejects.toMatchObject({ status: 400 });
    expect(orders.get(id)!.lines[1].state).toBe("AUTHORISED");
  });

  it("returns 404 expired for a missing order", async () => {
    await expect(ship("NOPE", "line-1", "x", makeDeps())).rejects.toMatchObject({ status: 404, message: "expired" });
  });
});

describe("close", () => {
  it("voids the rest, reports released money, and is idempotent", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-1", "SM58-LC", { ...deps, checkShipped: async (l) => ({ ...(await exactStub(l, "SM58-LC")) }) });
    await ship(id, "line-2", "SM58S", deps);
    const o = await closeOrder(id, deps);
    expect(o.status).toBe("CLOSED");
    expect(o.lines.map((l) => l.state)).toEqual(["CAPTURED", "NOT_CHARGED", "VOIDED"]);
    expect(o.released_cents).toBe(21800 + 19600);
    const again = await closeOrder(id, deps);
    expect(again.released_cents).toBe(o.released_cents);
  });

  it("refuses to close while a line is being checked", async () => {
    let release!: () => void;
    const slow: Deps["checkShipped"] = (l, s) => new Promise((res) => (release = () => res(exactStub(l, s))));
    const deps = makeDeps({ checkShipped: slow });
    const id = await authorised(deps);
    const pending = ship(id, "line-2", "SM58-LC", deps);
    await expect(closeOrder(id, deps)).rejects.toMatchObject({ status: 409 });
    release();
    await pending;
  });

  it("skips the void when everything was captured", async () => {
    const voidFn = vi.fn(mockPayPal.voidAuthorization);
    const all: Deps["checkShipped"] = async (l) => ({ ...(await exactStub(l, "SM58-LC")) });
    const deps = makeDeps({ paypal: { ...mockPayPal, voidAuthorization: voidFn }, checkShipped: all });
    const id = await authorised(deps);
    for (const l of ["line-1", "line-2", "line-3"]) await ship(id, l, "SM58-LC", deps);
    const o = await closeOrder(id, deps);
    expect(voidFn).not.toHaveBeenCalled();
    expect(o.released_cents).toBe(0);
  });

  it("never reports money as released when the void failed, and a retry finishes the job (R-P4)", async () => {
    const refuse = new PayPalError(422, JSON.stringify({ details: [{ issue: "CANNOT_BE_VOIDED" }] }), "void");
    const failing = makeDeps({ paypal: { ...mockPayPal, voidAuthorization: async () => Promise.reject(refuse) } });
    const id = await authorised(failing);
    await expect(closeOrder(id, failing)).rejects.toMatchObject({ status: 502, message: "release_failed" });
    const open = orders.get(id)!;
    expect(open.status).toBe("AUTHORISED");
    expect(open.released_cents).toBeUndefined();
    expect(open.lines.every((l) => l.state === "AUTHORISED")).toBe(true);
    expect(open.events.some((e) => e.includes("VOID_FAILED"))).toBe(true);

    const o = await closeOrder(id, makeDeps()); // PayPal cooperates on the retry
    expect(o.status).toBe("CLOSED");
    expect(o.lines.every((l) => l.state === "VOIDED")).toBe(true);
    expect(o.released_cents).toBe(22499 + 21800 + 19600);
  });

  it("treats a void whose reply was lost as done, after checking PayPal (R-P4)", async () => {
    const deps = makeDeps({
      paypal: {
        ...mockPayPal,
        voidAuthorization: async (...args) => {
          await mockPayPal.voidAuthorization(...args);
          throw new PayPalError(0, "timeout", "void");
        },
      },
    });
    const id = await authorised(deps);
    const o = await closeOrder(id, deps);
    expect(o.status).toBe("CLOSED");
    expect(o.events.some((e) => e.includes("VOID_CONFIRMED_BY_LOOKUP"))).toBe(true);
  });
});

describe("unconfirmed holds (R-P5)", () => {
  it("keeps the authorisation ID so close can release it, and never charges the line", async () => {
    const pending = makeDeps({
      paypal: {
        ...mockPayPal,
        authorizeOrder: async (orderId, requestId) => {
          const r = await mockPayPal.authorizeOrder(orderId, requestId);
          return {
            ...r,
            purchase_units: r.purchase_units.map((u) => ({
              ...u,
              payments: { authorizations: (u.payments?.authorizations ?? []).map((a) => ({ ...a, status: "PENDING" })) },
            })),
          };
        },
      },
    });
    const created = await createOrder(LINES, pending);
    const o = await authorizeOrder(created.orderId, pending);
    expect(o.status).toBe("CREATED");
    expect(o.lines.every((l) => l.state === "IN_BUNDLE" && l.auth_id)).toBe(true);
    await expect(ship(o.orderId, "line-2", "SM58-LC", pending)).rejects.toMatchObject({ status: 409 });

    const closed = await closeOrder(o.orderId, makeDeps());
    expect(closed.status).toBe("CLOSED");
    expect(closed.lines.every((l) => l.state === "VOIDED")).toBe(true);
    expect(mockIsVoided(closed.lines[0].auth_id!)).toBe(true);
  });
});

describe("auto-close and safe reset (R-S2)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("releases and closes orders open for 24 h; never deletes an open order", async () => {
    const deps = makeDeps();
    const old = await authorised(deps);
    const fresh = await authorised(deps);
    orders.get(old)!.created_at = Date.now() - DAY - 60_000;

    pruneOld(); // must not delete the old order: it still holds money
    expect(orders.has(old)).toBe(true);

    expect(await sweepStale(deps)).toEqual([old]);
    expect(orders.get(old)!.status).toBe("CLOSED");
    expect(mockIsVoided(orders.get(old)!.lines[0].auth_id!)).toBe(true);
    expect(orders.get(fresh)!.status).toBe("AUTHORISED");

    pruneOld(Date.now() + DAY + 60_000); // a day after closing, the closed order is forgotten
    expect(orders.has(old)).toBe(false);
    expect(orders.has(fresh)).toBe(true); // still open, so still kept
  });

  it("'Start over' releases the hold before forgetting the order", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const authId = orders.get(id)!.lines[0].auth_id!;
    expect(await resetOrderSafely(id, deps)).toEqual({ cleared: true });
    expect(orders.has(id)).toBe(false);
    expect(mockIsVoided(authId)).toBe(true);
  });

  it("'Start over' keeps an order whose hold could not be released", async () => {
    const failing = makeDeps({
      paypal: { ...mockPayPal, voidAuthorization: async () => Promise.reject(new PayPalError(503, "{}", "void")) },
    });
    const id = await authorised(failing);
    expect(await resetOrderSafely(id, failing)).toEqual({ cleared: false, deferred: true });
    expect(orders.has(id)).toBe(true);
  });
});

describe("uncertain charges (risk R-P3)", () => {
  const timeout = () => new PayPalError(0, "The operation was aborted due to timeout", "POST capture");

  it("confirms a charge that went through even though the reply was lost", async () => {
    const deps = makeDeps({
      paypal: {
        ...mockPayPal,
        captureAuthorization: async (...args) => {
          await mockPayPal.captureAuthorization(...args); // PayPal took the money...
          throw timeout(); // ...but the reply never arrived
        },
      },
    });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.captured).toBe(true);
    expect(r.line.state).toBe("CAPTURED");
    expect(r.line.capture_uncertain).toBeUndefined();
    expect(mockCapturedCents(r.line.auth_id!)).toBe(21800);
  });

  it("says 'do not ship' when the charge never happened, then close confirms and releases", async () => {
    const deps = makeDeps({ paypal: { ...mockPayPal, captureAuthorization: async () => Promise.reject(timeout()) } });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.captured).toBe(false);
    expect(r.line.state).toBe("CAPTURE_FAILED");
    expect(r.line.capture_uncertain).toBe(true);
    expect(r.line.error).toMatch(/Do not ship/);

    const o = await closeOrder(id, makeDeps());
    expect(o.status).toBe("CLOSED");
    expect(o.lines[1].capture_uncertain).toBeUndefined();
    expect(o.lines[1].state).toBe("CAPTURE_FAILED");
    expect(mockIsVoided(o.lines[1].auth_id!)).toBe(true);
  });

  it("finds a late charge at close and tells the merchant to ship", async () => {
    const lateDeps = makeDeps({
      paypal: {
        ...mockPayPal,
        captureAuthorization: async (...args) => {
          await mockPayPal.captureAuthorization(...args);
          throw timeout();
        },
        getOrder: async () => Promise.reject(timeout()), // lookup also fails at ship time
      },
    });
    const id = await authorised(lateDeps);
    const r = await ship(id, "line-2", "SM58-LC", lateDeps);
    expect(r.line.state).toBe("CAPTURE_FAILED");
    expect(r.line.capture_uncertain).toBe(true);

    const o = await closeOrder(id, makeDeps()); // PayPal reachable again
    expect(o.lines[1].state).toBe("CAPTURED");
    expect(o.lines[1].error).toMatch(/Ship this part/);
    expect(o.released_cents).toBe(22499 + 19600); // the late charge is NOT counted as released
  });

  it("releases nothing while PayPal cannot confirm a charge", async () => {
    const down = makeDeps({
      paypal: {
        ...mockPayPal,
        captureAuthorization: async () => Promise.reject(timeout()),
        getOrder: async () => Promise.reject(timeout()),
      },
    });
    const id = await authorised(down);
    await ship(id, "line-2", "SM58-LC", down);
    await expect(closeOrder(id, down)).rejects.toMatchObject({ status: 503 });
    expect(orders.get(id)!.status).toBe("AUTHORISED");
    expect(mockIsVoided(orders.get(id)!.lines[0].auth_id!)).toBe(false);
  });

  it("does not look anything up after a clear refusal", async () => {
    const getOrder = vi.fn(mockPayPal.getOrder);
    const deps = makeDeps({
      paypal: {
        ...mockPayPal,
        getOrder,
        captureAuthorization: async () =>
          Promise.reject(new PayPalError(422, JSON.stringify({ details: [{ issue: "AUTHORIZATION_VOIDED" }] }), "capture")),
      },
    });
    const id = await authorised(deps);
    const r = await ship(id, "line-2", "SM58-LC", deps);
    expect(r.line.state).toBe("CAPTURE_FAILED");
    expect(r.line.capture_uncertain).toBeUndefined();
    expect(getOrder).not.toHaveBeenCalled();
  });
});

describe("can't fulfil (R-M2, proposed)", () => {
  it("cancels a held line with no AI or PayPal call, and close releases it", async () => {
    const capture = vi.fn(mockPayPal.captureAuthorization);
    const check = vi.fn(exactStub);
    const deps = makeDeps({ paypal: { ...mockPayPal, captureAuthorization: capture }, checkShipped: check });
    const id = await authorised(deps);
    const { line } = cancelLine({ orderId: id, line_id: "line-2", reason: "Out of stock <b>!" });
    expect(line.state).toBe("NOT_CHARGED");
    expect(line.cancel_reason).toBe("Out of stock b");
    expect(capture).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();

    await expect(ship(id, "line-2", "SM58-LC", deps)).rejects.toMatchObject({ status: 409 });
    const o = await closeOrder(id, deps);
    expect(o.released_cents).toBe(22499 + 21800 + 19600);
  });

  it("refuses to cancel a part that was already charged", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    let err: unknown;
    try {
      cancelLine({ orderId: id, line_id: "line-2" });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ status: 409 });
  });
});

describe("reset", () => {
  it("clears only the given order", async () => {
    const deps = makeDeps();
    const a = await authorised(deps);
    const b = await authorised(deps);
    resetOrder(a);
    expect(orders.has(a)).toBe(false);
    expect(orders.has(b)).toBe(true);
  });
});
