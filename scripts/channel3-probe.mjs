// Channel3 viability probe for AgentCart (Des, Part D). Run from the repo root.
//
// Usage (PowerShell):
//   $env:CHANNEL3_API_KEY="your-key"; node scripts/channel3-probe.mjs
//   $env:CHANNEL3_API_KEY="your-key"; node scripts/channel3-probe.mjs --pages   (also tests page-text fetching)
//
// Uses about 33 Channel3 searches. Needs Node 20+ (built-in fetch). No packages to install.
// Writes everything to results/channel3-probe-YYYY-MM-DD.json and prints a pass/fail summary.

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.CHANNEL3_API_KEY;
if (!KEY) {
  console.error('Set CHANNEL3_API_KEY first, e.g. $env:CHANNEL3_API_KEY="..."');
  process.exit(1);
}
const TEST_PAGES = process.argv.includes("--pages");
const API = process.env.CHANNEL3_API_URL || "https://api.trychannel3.com/v1/search";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalogue = JSON.parse(fs.readFileSync(path.join("data", "catalogue.json"), "utf8"));

// Lower-case, keep letters and digits only, split into words.
const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
// Joined form, so "SM58-LC", "SM58 LC" and "sm58lc" all compare equal.
const squash = (s) => words(s).join("");

async function search(query, filters) {
  const t0 = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 10, ...(filters ? { filters } : {}) }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Channel3 ${res.status} for "${query}": ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  return { ms, products: body.products ?? [] };
}

function summarise(p) {
  const offer = (p.offers ?? [])[0] ?? {};
  const price = offer.price?.price ?? offer.price ?? null;
  return {
    id: p.id,
    title: p.title,
    brand: (p.brands ?? []).map((b) => b.name).join(", ") || null,
    price: typeof price === "number" ? price : null,
    currency: offer.price?.currency ?? offer.currency ?? null,
    availability: offer.availability ?? null,
    retailer: offer.domain ?? null,
    offers: (p.offers ?? []).length,
    has_variants: Boolean(p.variants),
  };
}

// Does a result title name this exact catalogue variant?
function matchesVariant(item, title) {
  const t = squash(title);
  const v = squash(item.variant || item.model);
  const b = squash(item.brand).slice(0, 4);
  return t.includes(v) && (b === "" || t.includes(b));
}
// Weaker check: the model name is there, but the title doesn't spell out the variant. Needs a manual look.
function matchesModel(item, title) {
  return squash(title).includes(squash(item.model));
}

const out = { run_at: new Date().toISOString(), known_products: [], categories: [], repeat: [], pages: [] };

// ---- Step B3: known products as the answer key ----
console.log(`\nB3. Searching for all ${catalogue.length} catalogue products...`);
for (const item of catalogue) {
  const query = `${item.brand} ${item.model}`;
  try {
    const { ms, products } = await search(query);
    const top = products.slice(0, 3).map(summarise);
    const rank = top.findIndex((p) => matchesVariant(item, p.title));
    const modelRank = top.findIndex((p) => matchesModel(item, p.title));
    const row = {
      id: item.id,
      query,
      expected_variant: item.variant,
      our_price_usd: item.price_usd,
      result:
        rank === 0 ? "EXACT (top 1)" : rank > 0 ? `in top 3 (#${rank + 1})` : modelRank >= 0 ? "MODEL ONLY: check" : "MISS",
      top1: top[0] ?? null,
      top3_titles: top.map((p) => p.title),
      ms,
    };
    out.known_products.push(row);
    console.log(`  ${row.result.padEnd(16)} ${item.id.padEnd(20)} -> ${top[0]?.title ?? "(nothing)"}  ${top[0]?.price ?? ""} ${top[0]?.currency ?? ""}`);
  } catch (e) {
    out.known_products.push({ id: item.id, query, result: "ERROR", error: String(e.message) });
    console.log(`  ERROR            ${item.id}: ${e.message}`);
  }
  await sleep(300);
}

// Variant pairs that must come back as different products.
const pairs = [["mic-sm58lc", "mic-sm58s"]];
out.variant_pairs = pairs
  .map(([a, b]) => {
    const ra = out.known_products.find((r) => r.id === a);
    const rb = out.known_products.find((r) => r.id === b);
    if (!ra || !rb) return null;
    return { a, b, same_top1: ra.top1?.id && ra.top1?.id === rb.top1?.id };
  })
  .filter(Boolean);

// ---- Steps B4 and B5: category searches, run twice ----
const CATS = [
  { category: "interface", query: "USB audio interface with XLR mic input", max: 250 },
  { category: "microphone", query: "XLR dynamic microphone", max: 150 },
  { category: "cable", query: "XLR cable 10 ft", max: 40 },
  { category: "stand", query: "microphone boom arm", max: 150 },
  { category: "headphones", query: "closed back studio headphones", max: 200 },
];
console.log("\nB4/B5. Category searches (each run twice)...");
for (const c of CATS) {
  const filters = { price: { max_price: c.max }, availability: ["InStock"] };
  try {
    const first = await search(c.query, filters);
    await sleep(2000);
    const second = await search(c.query, filters);
    const a = first.products.map((p) => p.id);
    const b = second.products.map((p) => p.id);
    const items = first.products.map(summarise);
    const complete = items.filter((p) => p.brand && p.price != null && p.retailer).length;
    const overPrice = items.filter((p) => p.price != null && p.price > c.max).length;
    const row = {
      ...c,
      results: items.length,
      complete_fields: complete,
      over_price_filter: overPrice,
      currencies: [...new Set(items.map((p) => p.currency).filter(Boolean))],
      same_order_twice: JSON.stringify(a) === JSON.stringify(b),
      same_set_twice: a.length === b.length && a.every((id) => b.includes(id)),
      ms: [first.ms, second.ms],
      items,
    };
    out.categories.push(row);
    console.log(
      `  ${c.category.padEnd(11)} ${String(items.length).padStart(2)} results, ${complete} with brand+price+retailer, ` +
        `${overPrice} over the price cap, currency ${row.currencies.join("/") || "?"}, ` +
        `repeat: ${row.same_order_twice ? "same order" : row.same_set_twice ? "same set, order changed" : "DIFFERENT"}, ${first.ms} ms`
    );
  } catch (e) {
    out.categories.push({ ...c, error: String(e.message) });
    console.log(`  ${c.category}: ERROR ${e.message}`);
  }
}

// ---- Step C6 (optional): can we get usable text from manufacturer pages? ----
// Uses Jina Reader (free, no key). Checks how many hand-checked key_specs show up in the text.
if (TEST_PAGES) {
  console.log("\nC6. Fetching manufacturer pages as text (Jina Reader)...");
  const seen = new Set();
  for (const item of catalogue) {
    const url = item.spec_source_url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const t0 = Date.now();
      const res = await fetch(`https://r.jina.ai/${url}`);
      const text = res.ok ? await res.text() : "";
      const ms = Date.now() - t0;
      const pageWords = new Set(words(text));
      const specs = Object.entries(item.key_specs ?? {}).filter(
        ([, v]) => typeof v === "string" && !/not stated/i.test(v)
      );
      // A spec counts as found if at least 60% of its words (3+ letters, or any number) are on the page.
      const found = specs.filter(([, v]) => {
        const w = words(v).filter((x) => x.length > 2 || /\d/.test(x));
        if (!w.length) return false;
        return w.filter((x) => pageWords.has(x)).length / w.length >= 0.6;
      }).length;
      const row = { id: item.id, url, status: res.status, chars: text.length, specs_checked: specs.length, specs_found: found, ms };
      out.pages.push(row);
      console.log(`  ${String(found).padStart(2)}/${String(specs.length).padEnd(2)} specs found  ${String(text.length).padStart(6)} chars  ${item.id}`);
    } catch (e) {
      out.pages.push({ id: item.id, url, error: String(e.message) });
      console.log(`  ERROR ${item.id}: ${e.message}`);
    }
    await sleep(3500); // stay under Jina's free rate limit
  }
}

// ---- Summary against the pass marks in the plan ----
const exact = out.known_products.filter((r) => r.result === "EXACT (top 1)").length;
const top3 = out.known_products.filter((r) => r.result.startsWith("in top 3")).length;
const modelOnly = out.known_products.filter((r) => r.result.startsWith("MODEL ONLY")).length;
const okCats = out.categories.filter((c) => !c.error && c.results >= 3 && c.complete_fields >= 3 && c.over_price_filter === 0).length;
const repeatable = out.categories.filter((c) => c.same_set_twice).length;
const avgMs = Math.round(
  out.categories.flatMap((c) => c.ms ?? []).reduce((a, b) => a + b, 0) / Math.max(1, out.categories.flatMap((c) => c.ms ?? []).length)
);

console.log("\n================ SUMMARY ================");
console.log(`B3 exact variant at #1 : ${exact}/${catalogue.length}  (pass mark 18)  ${exact >= 18 ? "PASS" : "FAIL"}   [+${top3} more in top 3, ${modelOnly} model-only to check by hand]`);
for (const p of out.variant_pairs)
  console.log(`B3 ${p.a} vs ${p.b}: ${p.same_top1 ? "SAME product returned (FAIL)" : "different products (PASS)"}`);
console.log(`B4 usable categories   : ${okCats}/5  (pass mark 5)  ${okCats === 5 ? "PASS" : "FAIL"}`);
console.log(`B5 same results twice  : ${repeatable}/5  ${repeatable === 5 ? "PASS" : "CHECK: caching becomes required"}`);
console.log(`D  average search time : ${avgMs} ms`);
if (TEST_PAGES) {
  const usable = out.pages.filter((p) => p.specs_checked && p.specs_found / p.specs_checked >= 0.5).length;
  console.log(`C6 pages with usable text: ${usable}/${out.pages.length}  (pass mark: 80%)  ${usable / Math.max(1, out.pages.length) >= 0.8 ? "PASS" : "FAIL"}`);
}

const pair = out.variant_pairs[0];
const currencies = [...new Set(out.categories.flatMap((c) => c.currencies ?? []))].join("/") || "unknown currency";
console.log(
  `\nLine for the team message:\n"Channel3 found ${exact} of our ${catalogue.length} products as the exact variant` +
    (modelOnly ? ` (plus ${modelOnly} I checked by hand)` : "") +
    `, SM58-LC and SM58S came back ${pair && !pair.same_top1 ? "as separate products" : "as the SAME product"}, ` +
    `${okCats} of 5 category searches gave proper results in ${currencies}, and a search takes about ${(avgMs / 1000).toFixed(1)} s."`
);
console.log("(Edit the 'checked by hand' part after you've looked at the MODEL ONLY rows.)");

fs.mkdirSync("results", { recursive: true });
const file = path.join("results", `channel3-probe-${out.run_at.slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nFull results saved to ${file}`);
