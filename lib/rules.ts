import type { Product } from "./catalogue";

/**
 * Deterministic compatibility rules over the hand-filled key_specs (ground truth from D).
 * Used two ways: as the mock AI (AI_MODE=mock), and in live mode as an independent second opinion
 * on the AI's verdict. The AI never sees key_specs; only the server compares the two.
 */

export type RuleResult = {
  compatible: boolean;
  /** Set when a rule found a problem. */
  problem?: { product_id: string; reason: string; field: string; value: unknown };
};

const s = (p: Product, k: string) => String(p.key_specs[k] ?? "").toLowerCase();

/** The rules only cover interface and microphone pairings. Anything else returns null (no opinion). */
export function ruleCheck(check: Product, partners: Product[]): RuleResult | null {
  const iface = check.category === "interface" ? check : partners.find((p) => p.category === "interface");
  const mic = check.category === "microphone" ? check : partners.find((p) => p.category === "microphone");
  if (!mic || !iface || (check !== mic && check !== iface)) return null;

  const usbOnly = s(mic, "connector").includes("usb") && !s(mic, "connector").includes("xlr");
  if (usbOnly) {
    return {
      compatible: false,
      problem: {
        product_id: mic.id,
        reason: `${mic.variant} is USB only and cannot plug into the XLR inputs of ${iface.variant}.`,
        field: "connector",
        value: mic.key_specs.connector,
      },
    };
  }
  if (iface.listing.xlr_inputs === 0) {
    return {
      compatible: false,
      problem: { product_id: iface.id, reason: `${iface.variant} has no microphone input.`, field: "inputs", value: iface.key_specs.inputs },
    };
  }
  if (mic.key_specs.needs_phantom_power === true && s(iface, "phantom_power").startsWith("none")) {
    return {
      compatible: false,
      problem: {
        product_id: mic.id,
        reason: `${mic.variant} needs phantom power that ${iface.variant} does not supply.`,
        field: "phantom_power",
        value: mic.key_specs.phantom_power,
      },
    };
  }
  return { compatible: true };
}
