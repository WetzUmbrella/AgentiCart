import { config } from "./config";
import { mockPayPal } from "./paypal-mock";
import { PayPalError } from "./paypal-error";

export { PayPalError };

/**
 * Thin PayPal REST client. Every call that moves money takes a caller-built PayPal-Request-Id,
 * so a retry of the same operation reuses the same key (review 1.1):
 *   auth-${orderId}, cap-${orderId}-${lineId}, void-${authId}, track-${captureId}
 */

export type OrderItem = { name: string; sku: string; quantity: number; unit_cents: number };
export type PurchaseUnit = { reference_id: string; payee_email?: string; items: OrderItem[] };

export type CreatedOrder = { id: string; status: string; links?: { href: string; rel: string }[] };
export type Authorization = { id: string; status: string; amount?: { value: string } };
export type AuthorizedOrder = {
  id: string;
  status: string;
  purchase_units: { reference_id: string; payments?: { authorizations?: Authorization[] } }[];
};
export type Capture = { id: string; status: string; status_details?: { reason?: string } };

export interface PayPalApi {
  createOrder(units: PurchaseUnit[], requestId: string): Promise<CreatedOrder>;
  authorizeOrder(orderId: string, requestId: string): Promise<AuthorizedOrder>;
  captureAuthorization(authId: string, cents: number, finalCapture: boolean, requestId: string): Promise<Capture>;
  voidAuthorization(authId: string, requestId: string): Promise<void>;
  addTracking(orderId: string, captureId: string, trackingNumber: string, carrierNameOther: string, requestId: string): Promise<void>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

/** Builds the Orders v2 body. Item totals are computed in cents so they always add up exactly. */
export function buildOrderBody(units: PurchaseUnit[]) {
  const v = (c: number) => (c / 100).toFixed(2);
  return {
    intent: "AUTHORIZE",
    purchase_units: units.map((u) => {
      const totalCents = u.items.reduce((s, i) => s + i.unit_cents * i.quantity, 0);
      return {
        reference_id: u.reference_id,
        ...(u.payee_email ? { payee: { email_address: u.payee_email } } : {}),
        amount: {
          currency_code: "USD",
          value: v(totalCents),
          breakdown: { item_total: { currency_code: "USD", value: v(totalCents) } },
        },
        items: u.items.map((i) => ({
          name: i.name.slice(0, 127),
          sku: i.sku,
          quantity: String(i.quantity),
          unit_amount: { currency_code: "USD", value: v(i.unit_cents) },
        })),
      };
    }),
  };
}

let cachedToken: { value: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${config.paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal token failed: ${res.status} ${text}`);
  const data = JSON.parse(text);
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function pp<T>(path: string, method: string, body?: unknown, requestId?: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${config.paypalBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  // Check status before parsing: an HTML 5xx page would otherwise hide the real error (review 1.21).
  if (!res.ok) throw new PayPalError(res.status, text, `${method} ${path}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const restPayPal: PayPalApi = {
  createOrder: (units, requestId) => pp<CreatedOrder>("/v2/checkout/orders", "POST", buildOrderBody(units), requestId),

  authorizeOrder: (orderId, requestId) =>
    pp<AuthorizedOrder>(`/v2/checkout/orders/${orderId}/authorize`, "POST", {}, requestId),

  captureAuthorization: (authId, cents, finalCapture, requestId) =>
    pp<Capture>(
      `/v2/payments/authorizations/${authId}/capture`,
      "POST",
      { amount: { currency_code: "USD", value: (cents / 100).toFixed(2) }, final_capture: finalCapture },
      requestId,
    ),

  voidAuthorization: async (authId, requestId) => {
    await pp(`/v2/payments/authorizations/${authId}/void`, "POST", undefined, requestId);
  },

  addTracking: async (orderId, captureId, trackingNumber, carrierNameOther, requestId) => {
    await pp(
      `/v2/checkout/orders/${orderId}/track`,
      "POST",
      {
        capture_id: captureId,
        tracking_number: trackingNumber,
        carrier: "OTHER",
        carrier_name_other: carrierNameOther,
        notify_payer: false,
      },
      requestId,
    );
  },

  verifyWebhook: async (headers, rawBody) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return false;
    const result = await pp<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", "POST", {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    });
    return result.verification_status === "SUCCESS";
  },
};

export function getPayPal(): PayPalApi {
  return config.paypalMode === "sandbox" ? restPayPal : mockPayPal;
}
