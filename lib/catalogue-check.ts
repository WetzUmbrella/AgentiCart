import { ProductSchema } from "./catalogue";

export interface CatalogueReport {
  /** Failures: the catalogue is not usable until these are fixed. */
  problems: string[];
  /** Reminders that do not fail the check. */
  notes: string[];
}

/** Validates raw catalogue entries. Spec file lookup is passed in so tests need no files on disk. */
export function checkCatalogue(entries: unknown[], specExists: (specFile: string) => boolean): CatalogueReport {
  const problems: string[] = [];
  const notes: string[] = [];
  const ids = new Set<string>();
  entries.forEach((entry, i) => {
    const parsed = ProductSchema.safeParse(entry);
    if (!parsed.success) {
      const id = (entry as { id?: unknown } | null)?.id;
      const label = typeof id === "string" ? id : `entry ${i}`;
      for (const issue of parsed.error.issues) problems.push(`${label}: ${issue.path.join(".") || "(root)"} ${issue.message}`);
      return;
    }
    const p = parsed.data;
    if (ids.has(p.id)) problems.push(`DUPLICATE id ${p.id}`);
    ids.add(p.id);
    if (Math.round(p.price_usd * 100) / 100 !== p.price_usd) problems.push(`${p.id}: price has more than 2 decimals`);
    if (!specExists(p.spec_file)) problems.push(`${p.id}: MISSING data/${p.spec_file}  (source: ${p.spec_source_url})`);
    if (!p.verified_by_d) notes.push(`${p.id}: key_specs not yet verified by D against the spec sheet`);
  });
  return { problems, notes };
}
