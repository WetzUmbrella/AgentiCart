import { describe, expect, it } from "vitest";
import { attachWebhookEvent } from "@/lib/orders";
import { totalsFor } from "@/lib/totals";
import type { Order } from "@/lib/types";

const order = (status: Order["status"], states: Order["lines"][number]["state"][], released?: number): Order => ({
  orderId: "O1",
  status,
  created_at: Date.now(),
  events: [],
  released_cents: released,
  lines: states.map((state, i) => ({
    line_id: `line-${i + 1}`, product_id: "x", name: "x", merchant: "merchant_a", qty: 1,
    amount_cents: 1000, state, auth_id: "A1", capture_id: state === "CAPTURED" ? `C${i}` : undefined,
  })),
});

describe("ledger totals", () => {
  it("shows held money while open and released money only after close", () => {
    const open = totalsFor(order("AUTHORISED", ["CAPTURED", "NOT_CHARGED", "AUTHORISED"]));
    expect(open).toEqual({ authorised: 3000, charged: 1000, held: 2000, notCharged: 1000, released: null });
    const closed = totalsFor(order("CLOSED", ["CAPTURED", "NOT_CHARGED", "VOIDED"], 2000));
    expect(closed).toMatchObject({ charged: 1000, held: 0, released: 2000 });
  });
});

describe("webhook mapping", () => {
  it("finds the order by related order id or capture id", () => {
    const o = order("AUTHORISED", ["CAPTURED"]);
    expect(attachWebhookEvent({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "C0" } }, [o])).toBe(o);
    expect(o.events[0]).toContain("WEBHOOK PAYMENT.CAPTURE.COMPLETED");
    expect(
      attachWebhookEvent({ event_type: "X", resource: { supplementary_data: { related_ids: { order_id: "O1" } } } }, [o]),
    ).toBe(o);
    expect(attachWebhookEvent({ event_type: "X", resource: { id: "nope" } }, [o])).toBeUndefined();
  });
});
