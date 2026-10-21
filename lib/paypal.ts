import { config } from "./config";
import { mockPayPal } from "./paypal-mock";
import { PayPalError, isUncertain } from "./paypal-error";

export { PayPalError, isUncertain };

/**
 * Thin PayPal REST client. Every call that moves money takes a caller-built PayPal-Request-Id,
 * so a retry of the same operation reuses the same key (review 1.1):
 *   auth-${orderId}, cap-${orderId}-${lineId}, void-${authId}, track-${captureId}
 *
 * Failure handling (docs/risk-register.md, R-P1 to R-P3):
 * - Timeout, dropped connection, PayPal 5xx or 429: retried ONCE, with the same PayPal-Request-Id,
 *   so PayPal answers the repeat with the original result instead of acting twice.
 *   Requests without a request ID are only retried if they are reads (GET).
 * - 401 on an API call: the cached token is dropped and the call is retried once with a new token.
 * - Any clear 4xx answer: not retried; PayPal did not act.
 */
export const ppTiming = { timeoutMs: 20_000, retryDelayMs: 800 };

export type OrderItem = { name: string; sku: string; quantity: number; unit_cents: number };
export type PurchaseUnit = { reference_id: string; payee_email?: string; items: OrderItem[] };

export type CreatedOrder = { id: string; status: string; links?: { href: string; rel: string }[] };
export type Authorization = { id: string; status: string; amount?: { value: string } };
export type AuthorizedOrder = {
  id: string;
  status: string;
  purchase_units: { reference_id: string; payments?: { authorizations?: Authorization[] } }[];
};
export type Capture = { id: string; status: string; status_details?: { reason?: string }; invoice_id?: string };
/** GET /v2/checkout/orders/{id}: PayPal's own record of every authorisation and capture. */
export type OrderDetails = {
  id: string;
  status: string;
  purchase_units: {
    reference_id?: string;
    payments?: { authorizations?: Authorization[]; captures?: Capture[] };
  }[];
};

export interface PayPalApi {
  createOrder(units: PurchaseUnit[], requestId: string): Promise<CreatedOrder>;
  authorizeOrder(orderId: string, requestId: string): Promise<AuthorizedOrder>;
  /** invoiceId tags the capture so we can find it again if the reply is lost (risk R-P3). */
  captureAuthorization(
    authId: string,
    cents: number,
    finalCapture: boolean,
    requestId: string,
    invoiceId?: string,
  ): Promise<Capture>;
  voidAuthorization(authId: string, requestId: string): Promise<void>;
  getOrder(orderId: string): Promise<OrderDetails>;
  getAuthorization(authId: string): Promise<Authorization>;
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

/** Test helper: forget the cached OAuth token. */
export function clearTokenCache(): void {
  cachedToken = null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout; a request PayPal never answered becomes PayPalError status 0. */
async function send(url: string, label: string, init: RequestInit): Promise<{ res: Response; text: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ppTiming.timeoutMs) });
    return { res, text: await res.text() };
  } catch (err) {
    throw new PayPalError(0, err instanceof Error ? `${err.name}: ${err.message}` : String(err), label);
  }
}

async function fetchToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError(401, "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set", "token");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const { res, text } = await send(`${config.paypalBase}/v1/oauth2/token`, "POST /v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  // A 401 here means a wrong ID/Secret, or live keys used against the sandbox URL (playbook 12).
  if (!res.ok) throw new PayPalError(res.status, text, "POST /v1/oauth2/token");
  const data = JSON.parse(text);
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.value;
  try {
    return await fetchToken();
  } catch (err) {
    // Asking for a token never moves money, so an uncertain failure is always safe to retry once.
    if (!isUncertain(err)) throw err;
    await sleep(ppTiming.retryDelayMs);
    return fetchToken();
  }
}

async function ppOnce<T>(path: string, method: string, body?: unknown, requestId?: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const { res, text } = await send(`${config.paypalBase}${path}`, `${method} ${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Check status before parsing: an HTML 5xx page would otherwise hide the real error (review 1.21).
  if (!res.ok) throw new PayPalError(res.status, text, `${method} ${path}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function pp<T>(path: string, method: string, body?: unknown, requestId?: string): Promise<T> {
  try {
    return await ppOnce<T>(path, method, body, requestId);
  } catch (err) {
    if (err instanceof PayPalError && err.status === 401) {
      // Token expired or was revoked early: nothing was processed, so retry once with a fresh token.
      cachedToken = null;
      return ppOnce<T>(path, method, body, requestId);
    }
    // Only repeat a request PayPal will recognise as a repeat (same request ID), or a plain read.
    const safeToRepeat = Boolean(requestId) || method === "GET";
    if (!safeToRepeat || !isUncertain(err)) throw err;
    await sleep(ppTiming.retryDelayMs);
    return ppOnce<T>(path, method, body, requestId);
  }
}

export const restPayPal: PayPalApi = {
  createOrder: (units, requestId) => pp<CreatedOrder>("/v2/checkout/orders", "POST", buildOrderBody(units), requestId),

  authorizeOrder: (orderId, requestId) =>
    pp<AuthorizedOrder>(`/v2/checkout/orders/${orderId}/authorize`, "POST", {}, requestId),

  captureAuthorization: (authId, cents, finalCapture, requestId, invoiceId) =>
    pp<Capture>(
      `/v2/payments/authorizations/${authId}/capture`,
      "POST",
      {
        amount: { currency_code: "USD", value: (cents / 100).toFixed(2) },
        final_capture: finalCapture,
        ...(invoiceId ? { invoice_id: invoiceId } : {}),
      },
      requestId,
    ),

  voidAuthorization: async (authId, requestId) => {
    await pp(`/v2/payments/authorizations/${authId}/void`, "POST", undefined, requestId);
  },

  getOrder: (orderId) => pp<OrderDetails>(`/v2/checkout/orders/${orderId}`, "GET"),

  getAuthorization: (authId) => pp<Authorization>(`/v2/payments/authorizations/${authId}`, "GET"),

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
