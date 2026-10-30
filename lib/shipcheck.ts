// Deterministic helpers for the shipped-model check. No AI here.

const ALLOWED = /^[A-Za-z0-9 ./-]{1,64}$/;

/** Merchant text is limited to 64 chars of letters, digits, space, dot, slash and hyphen (review 1.14). */
export function isValidShippedModel(s: string): boolean {
  return typeof s === "string" && ALLOWED.test(s.trim()) && s.trim().length > 0;
}

/** Trim, upper-case, collapse spaces (review 1.16). */
export const norm = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, " ");

/** Letters and digits only: "Shure SM-58 LC" -> "SHURESM58LC". */
export const compact = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Exact match after normalising: the code path that needs no AI call. */
export function exactVariantMatch(shipped: string, variant: string): boolean {
  return norm(shipped) === norm(variant);
}

/**
 * Second key of the two-key rule: the merchant's own text must contain the verified variant's
 * letters and digits. The AI can explain and confirm, but it can never turn "SM58S" into a capture.
 */
export function containsVariant(shipped: string, variant: string): boolean {
  return compact(shipped).includes(compact(variant));
}

/** What was read off the label photo, by Gemini (live) or from the sample list (mock). */
export type LabelReading = {
  legible: boolean;
  label_text: string;
  /** The variant the reader says the label names, or null. */
  matched_variant: string | null;
  /** The reader's own yes/no. Necessary, never sufficient. */
  match: boolean;
  /** The reader's one-sentence explanation, used only when every key agrees. */
  reason: string;
};

export type ShipDecision = { capture: boolean; matched_variant: string | null; label_text: string | null; reason: string };

/** Label text is shown in the UI: keep it to one short line of printable characters. */
const cleanLabel = (s: string) => s.replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * The charge rule. A part is captured only when ALL of these hold:
 * 1. the label in the photo is legible;
 * 2. the reader says it matches AND names exactly the verified variant;
 * 3. the label text it read contains the verified variant (code check on the reading);
 * 4. the merchant's declared model contains the verified variant (code check on their claim).
 * Any failure is DO_NOT_CAPTURE with a reason written by code, so the reader can't talk its way to a charge.
 */
export function decideShipment(declared: string, variant: string, r: LabelReading): ShipDecision {
  const label = cleanLabel(r.label_text);
  const matched = r.matched_variant ? cleanLabel(r.matched_variant) : null;
  const no = (reason: string): ShipDecision => ({ capture: false, matched_variant: matched, label_text: label || null, reason });
  if (!r.legible || !label) return no("The model on the label photo could not be read. Not charged; retake the photo.");
  if (!containsVariant(label, variant)) return no(`The label in the photo reads "${label}", not the verified part ${variant}.`);
  if (!containsVariant(declared, variant)) return no(`The declared model "${declared.trim()}" is not the verified part ${variant}.`);
  if (!r.match || !matched || !exactVariantMatch(matched, variant)) {
    return no(`The label could not be confirmed as exactly ${variant}${r.reason ? `: ${r.reason}` : "."}`);
  }
  return { capture: true, matched_variant: matched, label_text: label, reason: r.reason || `The label shows the verified part ${variant}.` };
}
