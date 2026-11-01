import type { Product } from "./catalogue";
import { ruleCheck } from "./rules";
import type { AuditVerdict, Constraints } from "./types";

/**
 * Rule-based stand-in for Gemini (AI_MODE=mock). It reads key_specs, which the real AI never sees,
 * so it is ONLY for building the UI without an API key. Every verdict is flagged mock: true and
 * the UI shows a MOCK AI badge. Never record the demo video or the accuracy score in this mode.
 */

export function mockAudit(check: Product, partners: Product[]): AuditVerdict {
  const base = { product_id: check.id, confidence: "medium" as const, mock: true };
  const problem = ruleCheck(check, partners)?.problem;
  if (problem) {
    return {
      ...base,
      compatible: false,
      reason: `MOCK: ${problem.reason}`,
      evidence: [{ product_id: problem.product_id, quote: `MOCK test data: ${problem.field} = ${problem.value}` }],
    };
  }
  return { ...base, compatible: true, reason: "MOCK: no rule found a problem.", evidence: [] };
}

export function mockParseGoal(goal: string): Constraints {
  const hostsMatch = goal.match(/(\d+)\s*(people|persons|hosts|speakers)/i);
  const budgetMatch = goal.match(/\$\s*([\d,]+)/);
  return {
    hosts: hostsMatch ? Math.min(4, Math.max(1, Number(hostsMatch[1]))) : 1,
    budget_usd: budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null,
    categories_needed: ["interface", "microphone", "cable", "stand", "headphones"],
  };
}
