import type { LineState } from "./types";

export type RowState = LineState | "REJECTED" | "NOT_PAID";

export const STATE_LABEL: Record<RowState, string> = {
  NOT_PAID: "Not approved yet",
  REJECTED: "Not in bundle",
  IN_BUNDLE: "Waiting for approval",
  AUTHORISED: "Held",
  SHIPPED: "Checking shipped model",
  CAPTURED: "Charged",
  CAPTURE_FAILED: "Charge failed",
  NOT_CHARGED: "Not charged",
  VOIDED: "Released",
};
