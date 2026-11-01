import type { Authorization, AuthorizedOrder, Capture, CreatedOrder, OrderDetails, PayPalApi, PurchaseUnit } from "./paypal";
import { PayPalError } from "./paypal-error";

/**
 * In-process stand-in for the PayPal sandbox, for UI work without credentials (PAYPAL_MODE=mock).
 * It enforces the rules the real flow depends on: no capture beyond the authorised amount,
 * no void of a fully captured authorisation, no reused invoice_id, and idempotent replies for a
 * repeated PayPal-Request-Id. It also keeps PayPal's side of the record (captures per order), so
 * the "did that charge go through?" lookup can be tested.
 * It is NOT evidence of how the real sandbox behaves; the go/no-go scripts are.
 */

type MockCapture = { id: string; cents: number; invoice_id?: string; status: "COMPLETED" };
type MockAuth = { id: string; authorised: number; captured: number; voided: boolean; captures: MockCapture[] };
type MockOrder = { id: string; units: PurchaseUnit[]; auths: Map<string, MockAuth> };

type MockState = {
  orders: Map<string, MockOrder>;
  auths: Map<string, MockAuth>;
  replies: Map<string, unknown>;
  invoices: Set<string>;
  n: number;
};
const g = globalThis as unknown as { __ppMock?: MockState };
const state: MockState = (g.__ppMock ??= {
  orders: new Map<string, MockOrder>(),
  auths: new Map<string, MockAuth>(),
  replies: new Map<string, unknown>(),
  invoices: new Set<string>(),
  n: 0,
});
// Mock state created by an older version of this file can survive hot reload without this field.
if (!(state as Partial<MockState>).invoices) state.invoices = new Set<string>();

const nextId = (prefix: string) => `${prefix}${String(++state.n).padStart(6, "0")}MOCK`;

function once<T>(requestId: string, fn: () => T): T {
  if (state.replies.has(requestId)) return state.replies.get(requestId) as T;
  const out = fn();
  state.replies.set(requestId, out);
  return out;
}

const fail = (status: number, issue: string, path: string): never => {
  throw new PayPalError(status, JSON.stringify({ name: "UNPROCESSABLE_ENTITY", details: [{ issue }] }), path);
};

const authStatus = (a: MockAuth): string =>
  a.voided ? "VOIDED" : a.captured >= a.authorised ? "CAPTURED" : a.captured > 0 ? "PARTIALLY_CAPTURED" : "CREATED";

export const mockPayPal: PayPalApi = {
  async createOrder(units, requestId): Promise<CreatedOrder> {
    return once(requestId, () => {
      const id = nextId("ORD");
      state.orders.set(id, { id, units, auths: new Map() });
      return { id, status: "CREATED", links: [{ rel: "approve", href: `mock://approve/${id}` }] };
    });
  },

  async authorizeOrder(orderId, requestId): Promise<AuthorizedOrder> {
    return once(requestId, () => {
      const o = state.orders.get(orderId) ?? fail(404, "RESOURCE_NOT_FOUND", "authorize");
      return {
        id: orderId,
        status: "COMPLETED",
        purchase_units: o.units.map((u) => {
          const total = u.items.reduce((s, i) => s + i.unit_cents * i.quantity, 0);
          const a: MockAuth = { id: nextId("AUTH"), authorised: total, captured: 0, voided: false, captures: [] };
          state.auths.set(a.id, a);
          o.auths.set(u.reference_id, a);
          return {
            reference_id: u.reference_id,
            payments: { authorizations: [{ id: a.id, status: "CREATED", amount: { value: (total / 100).toFixed(2) } }] },
          };
        }),
      };
    });
  },

  async captureAuthorization(authId, cents, _finalCapture, requestId, invoiceId): Promise<Capture> {
    return once(requestId, () => {
      const a = state.auths.get(authId) ?? fail(404, "RESOURCE_NOT_FOUND", "capture");
      if (a.voided) fail(422, "AUTHORIZATION_VOIDED", "capture");
      if (a.captured + cents > a.authorised) fail(422, "MAX_CAPTURE_AMOUNT_EXCEEDED", "capture");
      if (invoiceId && state.invoices.has(invoiceId)) fail(422, "DUPLICATE_INVOICE_ID", "capture");
      a.captured += cents;
      const c: MockCapture = { id: nextId("CAP"), cents, invoice_id: invoiceId, status: "COMPLETED" };
      a.captures.push(c);
      if (invoiceId) state.invoices.add(invoiceId);
      return { id: c.id, status: c.status, invoice_id: invoiceId };
    });
  },

  async voidAuthorization(authId, requestId): Promise<void> {
    once(requestId, () => {
      const a = state.auths.get(authId) ?? fail(404, "RESOURCE_NOT_FOUND", "void");
      if (a.voided) fail(422, "PREVIOUSLY_VOIDED", "void");
      if (a.captured >= a.authorised) fail(422, "PREVIOUSLY_CAPTURED", "void");
      a.voided = true;
      return true;
    });
  },

  async getOrder(orderId): Promise<OrderDetails> {
    const o = state.orders.get(orderId) ?? fail(404, "RESOURCE_NOT_FOUND", "get order");
    return {
      id: o.id,
      status: o.auths.size ? "COMPLETED" : "CREATED",
      purchase_units: o.units.map((u) => {
        const a = o.auths.get(u.reference_id);
        return {
          reference_id: u.reference_id,
          payments: a
            ? {
                authorizations: [{ id: a.id, status: authStatus(a) }],
                captures: a.captures.map((c) => ({ id: c.id, status: c.status, invoice_id: c.invoice_id })),
              }
            : undefined,
        };
      }),
    };
  },

  async getAuthorization(authId): Promise<Authorization> {
    const a = state.auths.get(authId) ?? fail(404, "RESOURCE_NOT_FOUND", "get authorization");
    return { id: a.id, status: authStatus(a) };
  },

  async addTracking(): Promise<void> {
    /* accepted */
  },

  async verifyWebhook(): Promise<boolean> {
    return false;
  },
};

/** Test helper: inspect what the mock "merchant" actually received. */
export function mockCapturedCents(authId: string): number {
  return state.auths.get(authId)?.captured ?? 0;
}

/** Test helper: is this authorisation voided at "PayPal"? */
export function mockIsVoided(authId: string): boolean {
  return state.auths.get(authId)?.voided ?? false;
}
