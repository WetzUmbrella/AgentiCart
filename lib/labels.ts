import type { Line, LineState } from "./types";

/**
 * What a row shows. Beyond the server's line states: UNCONFIRMED is a charge PayPal has not
 * confirmed either way (capture_uncertain), CANCELLED is a part the store can't supply.
 */
export type RowState = LineState | "REJECTED" | "NOT_PAID" | "NEEDS_CONFIRM" | "LEFT_OUT" | "UNCONFIRMED" | "CANCELLED";

export const lineRowState = (l: Line): RowState =>
  l.capture_uncertain ? "UNCONFIRMED" : l.cancel_reason ? "CANCELLED" : l.state;

export const STATE_LABEL: Record<RowState, string> = {
  NOT_PAID: "Not approved yet",
  NEEDS_CONFIRM: "Needs your OK",
  LEFT_OUT: "Left out of this order",
  REJECTED: "Not in bundle",
  IN_BUNDLE: "Waiting for approval",
  AUTHORISED: "Held",
  SHIPPED: "Checking shipped model",
  CAPTURED: "Charged",
  CAPTURE_FAILED: "Charge failed",
  NOT_CHARGED: "Not charged",
  VOIDED: "Released",
  UNCONFIRMED: "Being confirmed",
  CANCELLED: "Store can't supply",
};

/** "merchant_a" → "Store A". Display only: every part is paid to the one configured seller. */
export const storeLabel = (merchant: string) => `Store ${merchant.replace("merchant_", "").toUpperCase()}`;
