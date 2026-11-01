import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeOrder, cancelLine, closeOrder, createOrder, invoiceIdFor, shipLine, type Deps } from "@/lib/orders";
import { mockPayPal, mockCapturedCents, mockIsVoided } from "@/lib/paypal-mock";
import { PayPalError } from "@/lib/paypal";
import { reconcile, reconcileWithPayPal, type PayPalReader } from "@/lib/reconcile";
import { orders } from "@/lib/store";
import type { Line, Order, ShipVerdict } from "@/lib/types";

// Same fixtures as tests/orders.test.ts: line-1 22499, line-2 21800, line-3 19600 cents, one authorisation.
const TOTAL = 22499 + 21800 + 19600;

// These tests are about the money record, not the shipping check, so the fixtures below are written
// to work both before and after c-frontend is merged (label photo + label_text). The photo and
// label_text are ignored on feat/a-payments and required after the merge.

/** A real 1x1 PNG: the smallest photo the label check accepts. */
const PHOTO = {
  mime: "image/png" as const,
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
};

function exactStub(line: Line, shipped: string): Promise<ShipVerdict> {
  const ok = shipped === "SM58-LC";
  return Promise.resolve({
    line_id: "ignored-by-code",
    match: ok,
    matched_variant: ok ? "SM58-LC" : null,
    label_text: shipped,
    reason: ok ? "match" : "different variant",
    action: ok ? "CAPTURE" : "DO_NOT_CAPTURE",
  } as ShipVerdict);
}
const makeDeps = (over: Partial<Deps> = {}): Deps => ({ paypal: { ...mockPayPal }, checkShipped: exactStub, ...over });
const reader: PayPalReader = { getOrder: mockPayPal.getOrder, getAuthorization: mockPayPal.getAuthorization };

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
const ship = (orderId: string, line_id: string, shipped_model: string, deps: Deps) => {
  const input = { orderId, line_id, shipped_model, tracking_number: "DEMO123", photo: PHOTO };
  return shipLine(input, deps);
};
const authOf = (o: Order) => o.lines[0].auth_id!;

/** The to-do item, checked at "PayPal": authorised = captured + voided. */
function paypalSideAddsUp(o: Order, r: ReturnType<typeof reconcile>) {
  expect(mockCapturedCents(authOf(o))).toBe(r.charged_cents);
  expect(mockIsVoided(authOf(o))).toBe(r.released_cents > 0);
}

beforeEach(() => orders.clear());

describe("reconcile: the four handoff cases", () => {
  it("all shipped and charged: every cent charged, nothing to release", async () => {
    const all: Deps["checkShipped"] = (l) => exactStub(l, "SM58-LC");
    const deps = makeDeps({ checkShipped: all });
    const id = await authorised(deps);
    for (const l of ["line-1", "line-2", "line-3"]) await ship(id, l, "SM58-LC", deps);
    const o = await closeOrder(id, deps);

    const r = reconcile(o);
    expect(r).toMatchObject({ status: "PASS", settled: true, held_cents: TOTAL, charged_cents: TOTAL, released_cents: 0, still_held_cents: 0 });
    expect(r.reasons).toEqual([]);
    paypalSideAddsUp(o, r);
    expect(await reconcileWithPayPal(o, reader)).toMatchObject({ status: "PASS", paypal: "MATCHED", settled: true });
  });

  it("one charged, one blocked, one never shipped, then close", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps); // charged
    await ship(id, "line-1", "SM58S", deps); // wrong variant: NOT_CHARGED
    const o = await closeOrder(id, deps); // line-3 never shipped: VOIDED

    const r = reconcile(o);
    expect(r).toMatchObject({ status: "PASS", settled: true, held_cents: TOTAL, charged_cents: 21800, released_cents: 22499 + 19600 });
    expect(r.released_cents).toBe(o.released_cents); // our count and closeOrder's agree
    paypalSideAddsUp(o, r);
    expect((await reconcileWithPayPal(o, reader)).status).toBe("PASS");
  });

  it("\"Can't fulfil\" then close: the cancelled part is released, not charged", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-1", "SM58-LC", { ...deps, checkShipped: (l) => exactStub(l, "SM58-LC") });
    cancelLine({ orderId: id, line_id: "line-2", reason: "Out of stock" });
    const o = await closeOrder(id, deps);

    const r = reconcile(o);
    expect(r).toMatchObject({ status: "PASS", charged_cents: 22499, released_cents: 21800 + 19600, still_held_cents: 0 });
    paypalSideAddsUp(o, r);
    expect((await reconcileWithPayPal(o, reader)).status).toBe("PASS");
  });

  it("an uncertain capture is UNKNOWN, never PASS, until close settles it", async () => {
    const timeout = () => new PayPalError(0, "The operation was aborted due to timeout", "POST capture");
    const lost = makeDeps({
      paypal: {
        ...mockPayPal,
        captureAuthorization: async (...args) => {
          await mockPayPal.captureAuthorization(...args); // PayPal took the money...
          throw timeout(); // ...but the reply never arrived
        },
        getOrder: async () => Promise.reject(timeout()), // and the lookup failed too
      },
    });
    const id = await authorised(lost);
    await ship(id, "line-2", "SM58-LC", lost);
    const open = orders.get(id)!;

    const r = reconcile(open);
    expect(r).toMatchObject({ status: "UNKNOWN", settled: false, unknown_cents: 21800, charged_cents: 0, released_cents: 0 });
    expect(r.held_cents).toBe(r.charged_cents + r.released_cents + r.still_held_cents + r.unknown_cents);
    expect(r.reasons.join()).toMatch(/line-2: PayPal has not confirmed/);

    // PayPal reachable again: it shows the charge, but our record has not caught up. Still not PASS.
    const v2 = await reconcileWithPayPal(open, reader);
    expect(v2.status).toBe("UNKNOWN");
    expect(v2.reasons.join()).toMatch(/line-2: PayPal shows it charged/);

    // Close settles it as a late charge; now the books balance.
    const closed = await closeOrder(id, makeDeps());
    expect(reconcile(closed)).toMatchObject({ status: "PASS", charged_cents: 21800, released_cents: 22499 + 19600 });
    expect((await reconcileWithPayPal(closed, reader)).status).toBe("PASS");
  });
});

describe("reconcile: open orders and the identity", () => {
  it("an open order part-way through passes but is not settled", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    await ship(id, "line-1", "SM58S", deps); // blocked: NOT_CHARGED, but its money is still held until close
    const r = reconcile(orders.get(id)!);
    expect(r).toMatchObject({ status: "PASS", settled: false, charged_cents: 21800, released_cents: 0, still_held_cents: 22499 + 19600 });
    expect((await reconcileWithPayPal(orders.get(id)!, reader)).status).toBe("PASS"); // PARTIALLY_CAPTURED at PayPal
  });

  it("lines without an authorisation hold nothing", async () => {
    const o = await createOrder(LINES, makeDeps()); // created, never authorised
    expect(reconcile(o)).toMatchObject({ status: "PASS", held_cents: 0, still_held_cents: 0 });
  });
});

describe("reconcile: it catches broken books", () => {
  it("fails a closed order that still holds money", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = structuredClone(await closeOrder(id, deps));
    o.lines[2].state = "AUTHORISED"; // a line close forgot about
    const r = reconcile(o);
    expect(r.status).toBe("FAIL");
    expect(r.reasons.join()).toMatch(/voided|still held/);
  });

  it("fails a closed order whose hold was never voided", async () => {
    const all: Deps["checkShipped"] = (l) => exactStub(l, "SM58-LC");
    const deps = makeDeps({ checkShipped: all });
    const id = await authorised(deps);
    for (const l of ["line-1", "line-2"]) await ship(id, l, "SM58-LC", deps);
    cancelLine({ orderId: id, line_id: "line-3" });
    const o = structuredClone(await closeOrder(id, deps));
    o.voided_auth_ids = []; // as if close had skipped the void and still reported 0 released
    o.released_cents = 0;
    const r = reconcile(o);
    expect(r).toMatchObject({ status: "FAIL", still_held_cents: 19600 });
    expect(r.reasons.join()).toMatch(/order is closed but 19600 cents are still held/);
  });

  it("fails when closeOrder's released figure and the lines disagree", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = structuredClone(await closeOrder(id, deps));
    o.released_cents = TOTAL - 1;
    expect(reconcile(o).status).toBe("FAIL");
  });

  it("fails a CAPTURED line with no capture ID", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    const o = structuredClone(orders.get(id)!);
    o.lines[1].capture_id = undefined;
    expect(reconcile(o).reasons.join()).toMatch(/line-2 is CAPTURED but has no capture ID/);
  });

  it("v2 fails when PayPal charged a line our record says is not charged", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = orders.get(id)!;
    // A charge made outside our code path (e.g. someone captured in the PayPal dashboard).
    await mockPayPal.captureAuthorization(authOf(o), 21800, false, "rogue", invoiceIdFor(id, "line-2"));
    expect(reconcile(o).status).toBe("PASS"); // our own record cannot see it...
    const v2 = await reconcileWithPayPal(o, reader); // ...PayPal's can
    expect(v2).toMatchObject({ status: "FAIL", paypal: "MISMATCH" });
    expect(v2.reasons.join()).toMatch(/line-2: PayPal shows a completed charge .* but we record AUTHORISED/);
  });

  it("v2 fails when our record says charged and PayPal has no such charge", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = structuredClone(orders.get(id)!);
    o.lines[1].state = "CAPTURED";
    o.lines[1].capture_id = "CAP-NOT-AT-PAYPAL";
    const v2 = await reconcileWithPayPal(o, reader);
    expect(v2.status).toBe("FAIL");
    expect(v2.reasons.join()).toMatch(/PayPal has no such completed charge/);
  });

  it("v2 fails when we think a hold is live but PayPal has voided it", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const o = orders.get(id)!;
    await mockPayPal.voidAuthorization(authOf(o), "void-elsewhere");
    const v2 = await reconcileWithPayPal(o, reader);
    expect(v2.status).toBe("FAIL");
    expect(v2.reasons.join()).toMatch(/PayPal says VOIDED/);
  });
});

describe("reconcile: amounts and PayPal states", () => {
  // The mock returns no amounts or PENDING charges, so these wrap its reads the way the real API answers.
  async function oneCharged() {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    return orders.get(id)!;
  }

  it("v2 fails when PayPal authorised a different total than our lines add up to", async () => {
    const o = await oneCharged();
    const r: PayPalReader = {
      ...reader,
      getAuthorization: async (id) => ({ ...(await mockPayPal.getAuthorization(id)), amount: { value: "100.00" } }),
    };
    expect((await reconcileWithPayPal(o, r)).reasons.join()).toMatch(/our lines add up to 63899 cents, PayPal authorised 10000/);
  });

  it("v2 fails when a charge at PayPal is a different amount", async () => {
    const o = await oneCharged();
    const r: PayPalReader = {
      ...reader,
      getOrder: async (id) => {
        const rec = await mockPayPal.getOrder(id);
        for (const u of rec.purchase_units) for (const c of u.payments?.captures ?? []) Object.assign(c, { amount: { value: "1.00" } });
        return rec;
      },
    };
    const v2 = await reconcileWithPayPal(o, r);
    expect(v2.status).toBe("FAIL");
    expect(v2.reasons.join()).toMatch(/line-2: we charged 21800 cents, PayPal shows 100/);
  });

  it("v2 is UNKNOWN while PayPal shows a charge as PENDING", async () => {
    const o = await oneCharged();
    const r: PayPalReader = {
      ...reader,
      getOrder: async (id) => {
        const rec = await mockPayPal.getOrder(id);
        for (const u of rec.purchase_units) for (const c of u.payments?.captures ?? []) c.status = "PENDING";
        return rec;
      },
    };
    const v2 = await reconcileWithPayPal(o, r);
    expect(v2.reasons.join()).toMatch(/line-2: PayPal shows the charge as PENDING/);
    expect(v2.status).not.toBe("PASS");
  });

  it("fails a VOIDED line whose void PayPal never confirmed", async () => {
    const o = structuredClone(await oneCharged());
    o.lines[2].state = "VOIDED";
    expect(reconcile(o).reasons.join()).toMatch(/line-3 is VOIDED but PayPal never confirmed the void/);
  });

  it("fails an open order that already reports money released", async () => {
    const o = structuredClone(await oneCharged());
    o.released_cents = 19600;
    expect(reconcile(o).reasons.join()).toMatch(/order is open but already reports 19600 cents released/);
  });

  it("fails a line state the check does not know, rather than guessing", async () => {
    const o = structuredClone(await oneCharged());
    (o.lines[0] as { state: string }).state = "REFUNDED";
    expect(reconcile(o)).toMatchObject({ status: "FAIL" });
    expect(reconcile(o).reasons.join()).toMatch(/line-1 has a state reconcile does not know: REFUNDED/);
  });

  it("v2 fails on two completed PayPal charges for one line (a double charge)", async () => {
    const o = await oneCharged();
    const r: PayPalReader = {
      ...reader,
      getOrder: async (id) => {
        const rec = await mockPayPal.getOrder(id);
        const caps = rec.purchase_units[0].payments!.captures!;
        caps.push({ ...caps[0], id: "CAP-DUPLICATE" });
        return rec;
      },
    };
    expect((await reconcileWithPayPal(o, r)).reasons.join()).toMatch(/line-2: PayPal shows 2 completed charges for one line/);
  });

  it("v2 fails on a PayPal charge that belongs to no line", async () => {
    const o = await oneCharged();
    await mockPayPal.captureAuthorization(authOf(o), 100, false, "stray", "not-one-of-ours");
    const v2 = await reconcileWithPayPal(o, reader);
    expect(v2.status).toBe("FAIL");
    expect(v2.reasons.join()).toMatch(/belongs to no line on this order/);
  });

  it("fails a charged line with no authorisation", async () => {
    const o = structuredClone(await oneCharged());
    o.lines[1].auth_id = undefined;
    expect(reconcile(o).reasons.join()).toMatch(/line-2 is CAPTURED but has no authorisation/);
  });
});

describe("reconcile: it is safe to call", () => {
  it("never changes the order and only reads from PayPal", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    await ship(id, "line-2", "SM58-LC", deps);
    const o = orders.get(id)!;
    const before = structuredClone(o);
    const spy = { getOrder: vi.fn(mockPayPal.getOrder), getAuthorization: vi.fn(mockPayPal.getAuthorization) };
    reconcile(o);
    await reconcileWithPayPal(o, spy);
    expect(o).toEqual(before);
    expect(spy.getOrder).toHaveBeenCalledTimes(1);
    expect(spy.getAuthorization).toHaveBeenCalledTimes(1); // one authorisation for the whole bundle
  });

  it("PayPal down: UNKNOWN, never PASS", async () => {
    const deps = makeDeps();
    const id = await authorised(deps);
    const down: PayPalReader = {
      getOrder: async () => Promise.reject(new Error("down")),
      getAuthorization: async () => Promise.reject(new Error("down")),
    };
    expect(await reconcileWithPayPal(orders.get(id)!, down)).toMatchObject({ status: "UNKNOWN", paypal: "UNREACHABLE" });
  });
});
