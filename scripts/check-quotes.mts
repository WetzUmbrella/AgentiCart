// npm run check-quotes: checks that every evidence quote in the demo bundle appears in its PDF (review 1.13).
// PNG spec sheets cannot be text-checked here; check those by eye.
import "./_env.mts";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { buildBundle } from "../lib/bundle";
import { getProduct } from "../lib/catalogue";
import { specPath } from "../lib/ai";
import { quoteInText } from "../lib/trust";

const goal = process.argv[2] ?? "Podcast setup for 2 people under $900";
const b = await buildBundle(goal);
const verdicts = [...b.lines.map((l) => l.verdict!), ...b.rejected.map((r) => r.verdict)];
let bad = 0;
for (const v of verdicts) {
  for (const e of v.evidence) {
    const p = getProduct(e.product_id);
    if (!p) continue;
    if (!p.spec_file.endsWith(".pdf")) {
      console.log(`CHECK BY EYE  ${p.id} (PNG): "${e.quote}"`);
      continue;
    }
    const text = (await new PDFParse({ data: fs.readFileSync(specPath(p)) }).getText()).text;
    const found = quoteInText(text, e.quote);
    if (!found) bad++;
    console.log(`${found ? "FOUND  " : "MISSING"}  ${p.id}: "${e.quote}"`);
  }
}
console.log(bad ? `\n${bad} quote(s) not found verbatim. Say "quotes the spec sheet" in the video, not "the exact line".` : "\nAll PDF quotes found.");
