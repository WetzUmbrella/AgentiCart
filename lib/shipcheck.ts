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
