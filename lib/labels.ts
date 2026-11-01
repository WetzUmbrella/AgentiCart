import type { LineState } from "./types";

export type RowState = LineState | "REJECTED" | "NOT_PAID" | "NEEDS_CONFIRM" | "LEFT_OUT";

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
};

/** "merchant_a" → "Store A". Display only: every part is paid to the one configured seller. */
export const storeLabel = (merchant: string) => `Store ${merchant.replace("merchant_", "").toUpperCase()}`;
