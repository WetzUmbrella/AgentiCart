// npm run check-catalogue: validates data/catalogue.json and reports missing spec files.
import "./_env.mts";
import fs from "fs";
import path from "path";
import { catalogue } from "../lib/catalogue";
import { checkCatalogue } from "../lib/catalogue-check";

const { problems, notes } = checkCatalogue(catalogue, (f) => fs.existsSync(path.join(process.cwd(), "data", f)));
for (const line of [...notes, ...problems]) console.log(line);
const cats = catalogue.reduce<Record<string, number>>((a, p) => ((a[p.category] = (a[p.category] ?? 0) + 1), a), {});
console.log(`\n${catalogue.length} products:`, cats);
console.log(problems.length ? `${problems.length} problem(s) found.` : "Catalogue OK.");
process.exit(problems.length ? 1 : 0);
