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

/**
 * Whether the server found an evidence quote in the spec sheet's text.
 * "unchecked" covers image spec sheets, missing files and mock quotes: never shown as verified.
 */
export type QuoteCheck = "found" | "not_found" | "unchecked";

export type Evidence = {
  product_id: string;
  quote: string;
  /** Added by the server after the AI answers (lib/trust.ts). */
  quote_check?: QuoteCheck;
  source_url?: string;
};

export type TrustLevel = "high" | "medium" | "low" | "not_applicable";

/** One checkable reason behind a trust level. good/bad move the level; neutral only informs. */
export type TrustSignal = { key: string; label: string; status: "good" | "bad" | "neutral"; detail: string };

/**
 * Confidence built from signals a judge can check, not the model grading itself (lib/trust.ts).
 * A "low" part is held out of the PayPal approval until the shopper confirms it.
 */
export type Trust = { level: TrustLevel; summary: string; signals: TrustSignal[] };

/** Compatibility audit verdict (5.3). `confidence` is the AI's own rating; `trust` is ours. */
export type AuditVerdict = {
  product_id: string;
  compatible: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  evidence: Evidence[];
  trust?: Trust;
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

/**
 * What happened to each catalogue product in a category, in the order the builder tried them.
 * picked: first compatible part. rejected: failed the audit. not_tried: a cheaper part already fit.
 * filtered_out: ruled out by the listing before any audit (e.g. too few mic inputs for the hosts).
 */
export type SearchOutcome = "picked" | "rejected" | "not_tried" | "filtered_out";

export type SearchCandidate = {
  product_id: string;
  name: string;
  price_usd: number;
  outcome: SearchOutcome;
  note: string;
};

export type SearchStep = { category: string; candidates: SearchCandidate[] };

/** The full record of how the bundle was chosen, so the ranking can be checked, not trusted. */
export type SearchReceipt = { rule: string; catalogue_size: number; steps: SearchStep[] };

export type BundleResponse = {
  constraints: Constraints;
  lines: BundleLine[];
  rejected: { product: import("./catalogue").PublicProduct; verdict: AuditVerdict }[];
  search: SearchReceipt;
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
