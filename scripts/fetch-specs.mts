// npm run fetch-specs: downloads spec PDFs that have a direct spec_download_url into data/specs/.
// Products without one need a clean PNG screenshot of the official spec page (see the printed list).
import fs from "fs";
import path from "path";
import { catalogue } from "../lib/catalogue";

const done = new Set<string>();
const manual: string[] = [];

for (const p of catalogue) {
  const dest = path.join(process.cwd(), "data", p.spec_file);
  if (fs.existsSync(dest) || done.has(dest)) continue;
  if (!p.spec_download_url) {
    manual.push(`${p.id}: save a screenshot of ${p.spec_source_url} as data/${p.spec_file}`);
    continue;
  }
  try {
    const res = await fetch(p.spec_download_url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    done.add(dest);
    console.log(`saved data/${p.spec_file} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    manual.push(`${p.id}: download failed (${(e as Error).message}); get it from ${p.spec_download_url}`);
  }
}
if (manual.length) {
  console.log("\nStill needed (official source only, full spec section visible):");
  for (const m of manual) console.log(" - " + m);
}
