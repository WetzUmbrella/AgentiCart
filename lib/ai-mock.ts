import type { Product } from "./catalogue";
import type { AuditVerdict, Constraints } from "./types";

/**
 * Rule-based stand-in for Gemini (AI_MODE=mock). It reads key_specs, which the real AI never sees,
 * so it is ONLY for building the UI without an API key. Every verdict is flagged mock: true and
 * the UI shows a MOCK AI badge. Never record the demo video or the accuracy score in this mode.
 */

const s = (p: Product, k: string) => String(p.key_specs[k] ?? "").toLowerCase();

export function mockAudit(check: Product, partners: Product[]): AuditVerdict {
  const iface = check.category === "interface" ? check : partners.find((p) => p.category === "interface");
  const mic = check.category === "microphone" ? check : partners.find((p) => p.category === "microphone");
  const base = { product_id: check.id, confidence: "medium" as const, mock: true };

  if (mic && iface && (check === mic || check === iface)) {
    const usbOnly = s(mic, "connector").includes("usb") && !s(mic, "connector").includes("xlr");
    if (usbOnly) {
      return {
        ...base,
        compatible: false,
        reason: `MOCK: ${mic.variant} is USB only and cannot plug into the XLR inputs of ${iface.variant}.`,
        evidence: [{ product_id: mic.id, quote: `MOCK test data: connector = ${mic.key_specs.connector}` }],
      };
    }
    if (iface.listing.xlr_inputs === 0) {
      return {
        ...base,
        compatible: false,
        reason: `MOCK: ${iface.variant} has no microphone input.`,
        evidence: [{ product_id: iface.id, quote: `MOCK test data: inputs = ${iface.key_specs.inputs}` }],
      };
    }
    if (mic.key_specs.needs_phantom_power === true && s(iface, "phantom_power").startsWith("none")) {
      return {
        ...base,
        compatible: false,
        reason: `MOCK: ${mic.variant} needs phantom power that ${iface.variant} does not supply.`,
        evidence: [{ product_id: mic.id, quote: `MOCK test data: phantom_power = ${mic.key_specs.phantom_power}` }],
      };
    }
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
