// Shared contracts (playbook section 5, with the review's changes). Safe to import in the browser.

export type LineState =
  | "IN_BUNDLE"
  | "AUTHORISED"
  | "SHIPPED"
  | "CAPTURED"
  | "CAPTURE_FAILED"
  | "NOT_CHARGED"
  | "VOIDED";

export type OrderStatus = "CREATED" | "AUTHORISED" | "CLOSED";

export type Evidence = { product_id: string; quote: string };

/** Compatibility audit verdict (5.3). */
export type AuditVerdict = {
  product_id: string;
  compatible: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  evidence: Evidence[];
  mock?: boolean;
  cached?: boolean;
};

/** Shipped-model verdict (5.3, plus matched_variant). line_id is set by code, never by the model. */
export type ShipVerdict = {
  line_id: string;
  match: boolean;
  matched_variant: string | null;
  reason: string;
  action: "CAPTURE" | "DO_NOT_CAPTURE";
  mock?: boolean;
};

export type Line = {
  line_id: string;
  product_id: string;
  name: string;
  merchant: string;
  qty: number;
  amount_cents: number;
  state: LineState;
  auth_id?: string;
  capture_id?: string;
  tracking_number?: string;
  shipped_model?: string;
  verdict?: ShipVerdict;
  error?: string;
  /** true while we cannot tell whether PayPal took the money for this line (risk R-P3). */
  capture_uncertain?: boolean;
};

export type Order = {
  orderId: string;
  status: OrderStatus;
  lines: Line[];
  events: string[];
  created_at: number;
  released_cents?: number;
};

export type Constraints = {
  budget_usd: number | null;
  hosts: number;
  categories_needed: string[];
};

export type BundleLine = {
  line_id: string;
  product: import("./catalogue").PublicProduct;
  qty: number;
  verdict: AuditVerdict | null;
};

export type BundleResponse = {
  constraints: Constraints;
  lines: BundleLine[];
  rejected: { product: import("./catalogue").PublicProduct; verdict: AuditVerdict }[];
  total_cents: number;
  budget_warning: string | null;
  mock: boolean;
};

export type AppConfig = {
  paypalMode: "mock" | "sandbox";
  aiMode: "mock" | "live";
  clientId: string | null;
  multiMerchant: boolean;
};
