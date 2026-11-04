// Checks whether Channel3 can look up a product directly by its ID (GET /v1/products/{id}),
// and builds a sheet for picking the right Channel3 listing for each catalogue product.
//
// Usage (PowerShell, from the repo root):
//   $env:CHANNEL3_API_KEY="your-key"; node scripts/channel3-lookup.mjs
//
// Cost: 23 searches (1 credit each). Lookups by ID are free per Channel3's pricing page.
// Writes results/channel3-lookup-YYYY-MM-DD.json and results/channel3-mapping-sheet.md

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.CHANNEL3_API_KEY;
if (!KEY) {
  console.error('Set CHANNEL3_API_KEY first, e.g. $env:CHANNEL3_API_KEY="..."');
  process.exit(1);
}
const BASE = process.env.CHANNEL3_API_BASE || "https://api.trychannel3.com/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const catalogue = JSON.parse(fs.readFileSync(path.join("data", "catalogue.json"), "utf8"));

async function call(method, url, body) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers: { "x-api-key": KEY, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ms, json, text: json ? null : text.slice(0, 300) };
}

// The docs show offer prices as either price.price or price.amount, so accept both.
const amount = (o) => {
  const p = o?.price;
  if (typeof p === "number") return p;
  return p?.amount ?? p?.price ?? null;
};
const offerLine = (o) =>
  `${o.domain ?? "?"} $${amount(o) ?? "?"} ${o.price?.currency ?? ""} ${o.availability ?? ""}${o.condition && o.condition !== "new" ? ` (${o.condition.toUpperCase()})` : ""}`;

const out = { run_at: new Date().toISOString(), products: [] };
let lookups = 0, lookupOk = 0, consistent = 0, consistentChecked = 0;
const lookupMs = [];

console.log(`Looking up the top 5 Channel3 listings for each of ${catalogue.length} products...\n`);
for (const item of catalogue) {
  const query = `${item.brand} ${item.model}`;
  const s = await call("POST", `${BASE}/search`, { query, limit: 5 });
  const hits = s.json?.products ?? [];
  const row = { id: item.id, expected_variant: item.variant, our_price_usd: item.price_usd, query, search_status: s.status, candidates: [] };
  console.log(`== ${item.id}  (want: ${item.brand} ${item.variant}, $${item.price_usd})`);
  if (s.status !== 200) console.log(`   search failed: HTTP ${s.status} ${s.text ?? ""}`);

  for (const [i, h] of hits.entries()) {
    const d = await call("GET", `${BASE}/products/${encodeURIComponent(h.id)}`);
    lookups++;
    lookupMs.push(d.ms);
    const p = d.json;
    const ok = d.status === 200 && p && p.id;
    if (ok) lookupOk++;
    const offers = (p?.offers ?? []).map((o) => ({
      domain: o.domain, price: amount(o), currency: o.price?.currency ?? null, availability: o.availability ?? null, condition: o.condition ?? null,
    }));
    const cand = {
      rank: i + 1,
      channel3_id: h.id,
      title: p?.title ?? h.title,
      lookup_status: d.status,
      lookup_ms: d.ms,
      offers,
      variants: p?.variants ?? null,
      error: ok ? null : d.text ?? JSON.stringify(p).slice(0, 300),
    };
    // Check the first candidate twice, to see that a lookup gives the same answer each time.
    if (i === 0 && ok) {
      await sleep(1000);
      const again = await call("GET", `${BASE}/products/${encodeURIComponent(h.id)}`);
      consistentChecked++;
      const a = JSON.stringify((p.offers ?? []).map((o) => [o.domain, amount(o), o.availability]));
      const b = JSON.stringify((again.json?.offers ?? []).map((o) => [o.domain, amount(o), o.availability]));
      cand.same_on_second_lookup = a === b;
      if (a === b) consistent++;
    }
    row.candidates.push(cand);
    const best = (p?.offers ?? []).filter((o) => (o.condition ?? "new") === "new").sort((x, y) => (amount(x) ?? 1e9) - (amount(y) ?? 1e9))[0];
    console.log(
      `   #${i + 1} ${ok ? "OK " : "ERR"} ${h.id}  ${cand.title}\n` +
        `        ${offers.length} offers, cheapest new: ${best ? offerLine(best) : "none"}` +
        (p?.variants ? `  [has variants]` : "") +
        (ok ? "" : `\n        lookup failed: HTTP ${d.status} ${cand.error ?? ""}`)
    );
    await sleep(250);
  }
  out.products.push(row);
  console.log("");
  await sleep(300);
}

// Sheet for picking the right listing by hand.
let md = `# Channel3 mapping sheet (${out.run_at.slice(0, 10)})\n\nFor each product, write the correct Channel3 ID in the "Pick" line, or "none" if no candidate is the exact variant.\n\n`;
for (const r of out.products) {
  md += `## ${r.id}: want ${r.expected_variant} ($${r.our_price_usd})\n\n| # | Channel3 ID | Title | Offers (new) | Cheapest new |\n|---|---|---|---|---|\n`;
  for (const c of r.candidates) {
    const news = c.offers.filter((o) => (o.condition ?? "new") === "new");
    const cheapest = news.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))[0];
    md += `| ${c.rank} | \`${c.channel3_id}\` | ${String(c.title).replace(/\|/g, "/")} | ${news.length} | ${cheapest ? `$${cheapest.price} ${cheapest.domain} ${cheapest.availability ?? ""}` : "-"} |\n`;
  }
  md += `\nPick: \n\n`;
}

const avg = lookupMs.length ? Math.round(lookupMs.reduce((a, b) => a + b, 0) / lookupMs.length) : 0;
console.log("================ SUMMARY ================");
console.log(`Lookup by ID works      : ${lookupOk}/${lookups}  ${lookups && lookupOk === lookups ? "PASS" : lookupOk ? "PARTLY" : "FAIL"}`);
console.log(`Same result on 2nd look : ${consistent}/${consistentChecked}`);
console.log(`Average lookup time     : ${avg} ms`);
const withVariants = out.products.flatMap((r) => r.candidates).filter((c) => c.variants).length;
console.log(`Candidates with variants: ${withVariants} (open the JSON to see if SM58-LC / SM58S appear as variants)`);

fs.mkdirSync("results", { recursive: true });
const file = path.join("results", `channel3-lookup-${out.run_at.slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
fs.writeFileSync(path.join("results", "channel3-mapping-sheet.md"), md);
console.log(`\nSaved ${file} and results/channel3-mapping-sheet.md`);
