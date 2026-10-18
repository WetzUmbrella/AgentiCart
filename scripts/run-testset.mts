// npm run testset > results/testset-YYYY-MM-DD.txt
// Scores the compatibility audit on D's held-out test set. Never edit the answers to raise the score.
import "./_env.mts";
import fs from "fs";
import { auditCompatibility, _resetAiState } from "../lib/ai";
import { getProduct } from "../lib/catalogue";

type Case = { case_id: string; bundle: string[]; check: string; expected_compatible: boolean; why: string };
const file = process.argv[2] ?? "data/testset.json";
const isSeed = file.endsWith("seed.json");
const cases: Case[] = JSON.parse(fs.readFileSync(file, "utf8"));
const seed: Case[] = fs.existsSync("data/seed.json") ? JSON.parse(fs.readFileSync("data/seed.json", "utf8")) : [];

if (process.env.AI_MODE !== "live") {
  console.error("Set AI_MODE=live. A mock score means nothing.");
  process.exit(1);
}
if (cases.length === 0) {
  console.error(`${file} is empty. D writes the cases first.`);
  process.exit(1);
}
const seedIds = new Set(seed.map((c) => c.case_id));
const overlap = isSeed ? [] : cases.filter((c) => seedIds.has(c.case_id));
if (overlap.length) {
  console.error(`Seed cases must not be in the scored set: ${overlap.map((c) => c.case_id).join(", ")}`);
  process.exit(1);
}

_resetAiState();
const pause = Number(process.env.TESTSET_PAUSE_MS ?? 5000);
let correct = 0;
console.log(`AgentCart accuracy run ${new Date().toISOString()}  model ${process.env.GEMINI_MODEL_PRO}`);
console.log("case   expected  got      ok   ms     reason");
for (const c of cases) {
  const check = getProduct(c.check);
  const others = c.bundle.filter((id) => id !== c.check).map(getProduct);
  if (!check || others.some((p) => !p)) throw new Error(`${c.case_id}: unknown product id`);
  const t = Date.now();
  const v = await auditCompatibility(check, others as NonNullable<(typeof others)[number]>[]);
  const ok = v.compatible === c.expected_compatible;
  correct += ok ? 1 : 0;
  console.log(
    `${c.case_id.padEnd(6)} ${String(c.expected_compatible).padEnd(9)} ${String(v.compatible).padEnd(8)} ${ok ? "yes" : "NO "}  ${String(Date.now() - t).padEnd(6)} ${v.reason}`,
  );
  for (const e of v.evidence) console.log(`         quote [${e.product_id}]: ${e.quote}`);
  await new Promise((r) => setTimeout(r, pause));
}
console.log(
  isSeed
    ? `\nDEV RUN on seed cases: ${correct}/${cases.length}. Not a score; never publish it.`
    : `\nSCORE ${correct}/${cases.length} on real spec-sheet pairings`,
);
