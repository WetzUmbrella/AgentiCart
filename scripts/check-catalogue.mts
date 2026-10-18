// npm run check-catalogue: validates data/catalogue.json and reports missing spec files.
import "./_env.mts";
import fs from "fs";
import path from "path";
import { catalogue } from "../lib/catalogue";

let problems = 0;
const ids = new Set<string>();
for (const p of catalogue) {
  if (ids.has(p.id)) (problems++, console.log(`DUPLICATE id ${p.id}`));
  ids.add(p.id);
  if (Math.round(p.price_usd * 100) / 100 !== p.price_usd) (problems++, console.log(`${p.id}: price has more than 2 decimals`));
  const file = path.join(process.cwd(), "data", p.spec_file);
  if (!fs.existsSync(file)) {
    problems++;
    console.log(`${p.id}: MISSING data/${p.spec_file}  (source: ${p.spec_source_url})`);
  }
  if (!p.verified_by_d) console.log(`${p.id}: key_specs not yet verified by D against the spec sheet`);
}
const cats = catalogue.reduce<Record<string, number>>((a, p) => ((a[p.category] = (a[p.category] ?? 0) + 1), a), {});
console.log(`\n${catalogue.length} products:`, cats);
console.log(problems ? `${problems} problem(s) found.` : "Catalogue OK.");
process.exit(problems ? 1 : 0);
