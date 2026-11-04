import fs from "fs";
import path from "path";
import { getProduct, type Product } from "./catalogue";
import { ruleCheck } from "./rules";
import type { AuditVerdict, Evidence, QuoteCheck, Trust, TrustLevel, TrustSignal } from "./types";

/**
 * Turns an AI verdict into something a shopper can check instead of trust:
 * 1. every evidence quote is looked up in the spec sheet's own text and linked to its source;
 * 2. the verdict is compared with our hand-checked key_specs rules (an independent second opinion);
 * 3. a trust level is derived from those signals. The AI's self-rated confidence is shown for
 *    reference only and can lower the level, never raise it.
 * Server only. Nothing here can move money.
 */

/** Lower-case, collapse whitespace and dashes, drop punctuation, so line breaks in a PDF don't matter. */
export const flatText = (s: string) =>
  s.toLowerCase().replace(/[\s‐-―-]+/g, " ").replace(/[^\w ]/g, "").trim();

/**
 * PDFs break words across lines ("rein-\nforcement"). The text is tried both with those breaks
 * joined and kept, so a real compound like "XLR-\nmale" still matches "XLR-male".
 */
export function quoteInText(text: string, quote: string): boolean {
  const q = flatText(quote);
  if (!q) return false;
  const joined = text.replace(/[\u2010-\u2015-][^\S\n]*\n\s*/g, "");
  return flatText(text).includes(q) || flatText(joined).includes(q);
}

const g = globalThis as unknown as { __specText?: Map<string, Promise<string | null>> };
const specTextCache = (g.__specText ??= new Map<string, Promise<string | null>>());

/** Text of a PDF spec sheet, or null for image sheets and missing files (those stay "unchecked"). */
export function specText(p: Product): Promise<string | null> {
  if (!p.spec_file.endsWith(".pdf")) return Promise.resolve(null);
  const hit = specTextCache.get(p.spec_file);
  if (hit) return hit;
  const job = (async () => {
    const abs = path.join(process.cwd(), "data", p.spec_file);
    if (!fs.existsSync(abs)) return null;
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: fs.readFileSync(abs) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  })().catch(() => null);
  specTextCache.set(p.spec_file, job);
  return job;
}

type TextReader = (p: Product) => Promise<string | null>;

async function checkEvidence(e: Evidence, involved: Product[], mock: boolean, read: TextReader): Promise<Evidence> {
  const product = involved.find((p) => p.id === e.product_id);
  const source_url = (product ?? getProduct(e.product_id))?.spec_source_url;
  let quote_check: QuoteCheck;
  if (mock) quote_check = "unchecked";
  // A quote attributed to a product that wasn't part of this check can't be supporting evidence.
  else if (!product) quote_check = "not_found";
  else {
    const text = await read(product);
    quote_check = text === null ? "unchecked" : quoteInText(text, e.quote) ? "found" : "not_found";
  }
  return { ...e, quote_check, ...(source_url ? { source_url } : {}) };
}

function quoteSignal(evidence: Evidence[], mock: boolean): TrustSignal {
  const key = "quotes";
  const label = "Spec-sheet quotes";
  if (mock) return { key, label, status: "neutral", detail: "Mock AI: quotes come from test data and are not checked." };
  if (evidence.length === 0) return { key, label, status: "bad", detail: "The AI gave no quote from a spec sheet." };
  const n = evidence.length;
  const missing = evidence.filter((e) => e.quote_check === "not_found").length;
  const unchecked = evidence.filter((e) => e.quote_check === "unchecked").length;
  const of = (k: number) => (n === 1 ? "The quote" : `${k} of ${n} quotes`);
  if (missing) return { key, label, status: "bad", detail: `${of(missing)} could not be found in the spec sheet text.` };
  if (unchecked) {
    return { key, label, status: "neutral", detail: `${of(unchecked)} could not be checked automatically (image spec sheet). Open the source to check by eye.` };
  }
  return { key, label, status: "good", detail: n === 1 ? "The quote was found word for word in the spec sheet." : `All ${n} quotes were found word for word in the spec sheets.` };
}

function handCheckedSignal(verdict: AuditVerdict, check: Product, partners: Product[], mock: boolean): TrustSignal {
  const key = "hand_checked";
  const label = "Hand-checked spec data";
  if (mock) return { key, label, status: "neutral", detail: "Mock AI is built from the hand-checked data, so it is not an independent check." };
  if (![check, ...partners].every((p) => p.verified_by_d)) {
    return { key, label, status: "neutral", detail: "Our team has not finished hand-checking these parts yet." };
  }
  const rule = ruleCheck(check, partners);
  if (!rule) return { key, label, status: "neutral", detail: "None of our hand-checked rules cover this pairing." };
  if (rule.problem) {
    return verdict.compatible
      ? { key, label, status: "bad", detail: `Disagrees with our hand-checked data: ${rule.problem.reason}` }
      : { key, label, status: "good", detail: "Our hand-checked data finds the same problem." };
  }
  return verdict.compatible
    ? { key, label, status: "good", detail: "Agrees with our hand-checked data: no connector or power conflict." }
    : { key, label, status: "neutral", detail: "Our hand-checked rules found no problem; the AI found one they don't cover." };
}

function aiRatingSignal(verdict: AuditVerdict): TrustSignal {
  const c = verdict.confidence;
  return {
    key: "ai_rating",
    label: "AI's own rating",
    status: c === "low" ? "bad" : "neutral",
    detail: c === "low" ? "The AI rated its own confidence low." : `The AI rated itself ${c}. Shown for reference; it never raises our level.`,
  };
}

const SUMMARY: Record<TrustLevel, string> = {
  high: "Quotes found in the spec sheets and confirmed by our hand-checked data.",
  medium: "Nothing failed, but not every check could be completed.",
  low: "At least one check failed. Review it before you approve.",
  not_applicable: "First part in the bundle, so there is nothing to check it against yet.",
};

export function trustLevel(signals: TrustSignal[]): Exclude<TrustLevel, "not_applicable"> {
  const status = (k: string) => signals.find((s) => s.key === k)?.status;
  if (signals.some((s) => s.status === "bad")) return "low";
  if (status("quotes") === "good" && status("hand_checked") === "good") return "high";
  return "medium";
}

/** Adds checked evidence and a trust assessment to a verdict about `check` against `partners`. */
export async function assessVerdict(
  verdict: AuditVerdict,
  check: Product,
  partners: Product[],
  read: TextReader = specText,
): Promise<AuditVerdict> {
  const mock = verdict.mock === true;
  const involved = [check, ...partners];
  const evidence = await Promise.all(verdict.evidence.map((e) => checkEvidence(e, involved, mock, read)));
  let trust: Trust;
  if (partners.length === 0) {
    trust = { level: "not_applicable", summary: SUMMARY.not_applicable, signals: [] };
  } else {
    const signals = [quoteSignal(evidence, mock), handCheckedSignal(verdict, check, partners, mock), aiRatingSignal(verdict)];
    const level = trustLevel(signals);
    trust = { level, summary: SUMMARY[level], signals };
  }
  return { ...verdict, evidence, trust };
}
