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

/**
 * The rules cover microphone-interface and microphone-stand pairings. Anything else returns null
 * (no opinion). A problem from either pairing wins; otherwise any rule that ran says compatible.
 */
export function ruleCheck(check: Product, partners: Product[]): RuleResult | null {
  const results = [micInterfaceCheck(check, partners), mountCheck(check, partners)].filter((r): r is RuleResult => r !== null);
  return results.find((r) => !r.compatible) ?? results[0] ?? null;
}

/** Thread sizes named in a mount_thread spec, adapters included in the box counted too. */
const threads = (spec: string) => new Set(spec.match(/\b(1\/4|3\/8|5\/8)\b/g) ?? []);

/**
 * A mic fits a stand only if they share a thread size, counting adapters that come in either box.
 * An adapter bought separately is not in the bundle, so it does not count (data/testset-rules.md).
 */
function mountCheck(check: Product, partners: Product[]): RuleResult | null {
  const stand = check.category === "stand" ? check : partners.find((p) => p.category === "stand");
  const mic = check.category === "microphone" ? check : partners.find((p) => p.category === "microphone");
  if (!mic || !stand || (check !== mic && check !== stand)) return null;
  const micThreads = threads(s(mic, "mount_thread"));
  const standThreads = threads(s(stand, "mount_thread"));
  if (micThreads.size === 0 || standThreads.size === 0) return null; // a spec is missing: no opinion
  if ([...micThreads].some((t) => standThreads.has(t))) return { compatible: true };
  return {
    compatible: false,
    problem: {
      product_id: stand.id,
      reason: `${stand.variant} mounts ${[...standThreads].join(" or ")} inch; ${mic.variant} takes ${[...micThreads].join(" or ")} inch, and no adapter in either box joins them.`,
      field: "mount_thread",
      value: stand.key_specs.mount_thread,
    },
  };
}

function micInterfaceCheck(check: Product, partners: Product[]): RuleResult | null {
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
