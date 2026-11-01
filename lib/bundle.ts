import { catalogue, productName, toPublic, type Category, type Product } from "./catalogue";
import { auditCompatibility, parseGoal } from "./ai";
import { config } from "./config";
import { toCents } from "./money";
import type { AuditVerdict, BundleLine, BundleResponse, Constraints, SearchCandidate, SearchStep } from "./types";

/**
 * Builds a bundle for a goal. Products always come from the catalogue (the AI never invents them).
 * Categories are audited in a fixed order and each pick is checked only against parts already
 * accepted (review 1.8). Within a category, candidates are tried cheapest first, so the result is
 * reproducible and every rejection on screen is a real audit result. The search receipt records
 * every product considered, so the shopper can see that nothing was placed by payment.
 */

export const RANKING_RULE =
  "In each category, the cheapest part that passes the compatibility check is picked. No paid placement, no affiliate links, no sponsored products.";

export const AUDIT_ORDER: Category[] = ["interface", "microphone", "cable", "stand", "headphones"];

/** How many of each part a setup needs for N hosts. */
export function qtyFor(category: Category, hosts: number): number {
  return category === "interface" ? 1 : hosts;
}

const byPrice = (a: Product, b: Product) => a.price_usd - b.price_usd || a.id.localeCompare(b.id);

/** Listing rules applied before any audit. Returns why a product is ruled out, or null if it stays in. */
function listingFilter(p: Product, c: Constraints): string | null {
  const inputs = p.listing.xlr_inputs ?? 0;
  if (p.category === "interface" && inputs < c.hosts) {
    return `Has ${inputs} mic input${inputs === 1 ? "" : "s"}; ${c.hosts} ${c.hosts === 1 ? "person needs" : "people need"} ${c.hosts}.`;
  }
  return null;
}

const candidate = (p: Product, outcome: SearchCandidate["outcome"], note: string): SearchCandidate => ({
  product_id: p.id,
  name: productName(p),
  price_usd: p.price_usd,
  outcome,
  note,
});

export async function buildBundle(goal: string): Promise<BundleResponse> {
  const constraints = await parseGoal(goal);
  const wanted = AUDIT_ORDER.filter((c) => constraints.categories_needed.includes(c));
  const accepted: Product[] = [];
  const lines: BundleLine[] = [];
  const rejected: BundleResponse["rejected"] = [];

  const steps: SearchStep[] = [];

  for (const category of wanted) {
    const inCategory = catalogue.filter((p) => p.category === category).sort(byPrice);
    const step: SearchStep = { category, candidates: [] };
    steps.push(step);
    let picked: Product | null = null;
    for (const p of inCategory) {
      const filtered = listingFilter(p, constraints);
      if (filtered) {
        step.candidates.push(candidate(p, "filtered_out", filtered));
        continue;
      }
      if (picked) {
        step.candidates.push(candidate(p, "not_tried", `A cheaper part (${productName(picked)}) already fits.`));
        continue;
      }
      const verdict: AuditVerdict = await auditCompatibility(p, accepted);
      if (verdict.compatible) {
        picked = p;
        accepted.push(p);
        lines.push({
          line_id: `line-${lines.length + 1}`,
          product: toPublic(p),
          qty: qtyFor(category, constraints.hosts),
          verdict,
        });
        step.candidates.push(candidate(p, "picked", "Cheapest part that passed the check."));
      } else {
        rejected.push({ product: toPublic(p), verdict });
        step.candidates.push(candidate(p, "rejected", verdict.reason));
      }
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
    search: { rule: RANKING_RULE, catalogue_size: catalogue.length, steps },
    total_cents,
    budget_warning: warnings.length ? warnings.join(" ") : null,
    mock: config.aiMode === "mock",
  };
}
