import { catalogue, toPublic, type Category, type Product } from "./catalogue";
import { auditCompatibility, parseGoal } from "./ai";
import { config } from "./config";
import { toCents } from "./money";
import type { AuditVerdict, BundleLine, BundleResponse, Constraints } from "./types";

/**
 * Builds a bundle for a goal. Products always come from the catalogue (the AI never invents them).
 * Categories are audited in a fixed order and each pick is checked only against parts already
 * accepted (review 1.8). Within a category, candidates are tried cheapest first, so the result is
 * reproducible and every rejection on screen is a real audit result.
 */

export const AUDIT_ORDER: Category[] = ["interface", "microphone", "cable", "stand", "headphones"];

/** How many of each part a setup needs for N hosts. */
export function qtyFor(category: Category, hosts: number): number {
  return category === "interface" ? 1 : hosts;
}

function candidatesFor(category: Category, c: Constraints): Product[] {
  return catalogue
    .filter((p) => p.category === category)
    .filter((p) => category !== "interface" || (p.listing.xlr_inputs ?? 0) >= c.hosts)
    .sort((a, b) => a.price_usd - b.price_usd || a.id.localeCompare(b.id));
}

export async function buildBundle(goal: string): Promise<BundleResponse> {
  const constraints = await parseGoal(goal);
  const wanted = AUDIT_ORDER.filter((c) => constraints.categories_needed.includes(c));
  const accepted: Product[] = [];
  const lines: BundleLine[] = [];
  const rejected: BundleResponse["rejected"] = [];

  for (const category of wanted) {
    for (const candidate of candidatesFor(category, constraints)) {
      const verdict: AuditVerdict = await auditCompatibility(candidate, accepted);
      if (verdict.compatible) {
        accepted.push(candidate);
        lines.push({
          line_id: `line-${lines.length + 1}`,
          product: toPublic(candidate),
          qty: qtyFor(category, constraints.hosts),
          verdict,
        });
        break;
      }
      rejected.push({ product: toPublic(candidate), verdict });
    }
  }

  const total_cents = lines.reduce((s, l) => s + toCents(l.product.price_usd) * l.qty, 0);
  const missing = wanted.filter((c) => !lines.some((l) => l.product.category === c));
  const warnings: string[] = [];
  if (missing.length) warnings.push(`No compatible ${missing.join(", ")} found in the demo catalogue.`);
  if (constraints.budget_usd !== null && total_cents > toCents(constraints.budget_usd)) {
    warnings.push(`This bundle is over your $${constraints.budget_usd} budget. Swap parts or remove some.`);
  }

  return {
    constraints,
    lines,
    rejected,
    total_cents,
    budget_warning: warnings.length ? warnings.join(" ") : null,
    mock: config.aiMode === "mock",
  };
}
