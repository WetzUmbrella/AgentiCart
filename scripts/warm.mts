export {};
// npm run warm -- https://your-app.onrender.com
// Wakes the hosted demo and fills the verdict cache with the demo goal before recording or judging.
const base = process.argv[2] ?? "http://localhost:3000";
const goal = process.argv[3] ?? "Podcast setup for 2 people under $900";
const t = Date.now();
await fetch(base).catch(() => undefined);
const res = await fetch(`${base}/api/bundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) });
const body = await res.json();
console.log(`HTTP ${res.status} in ${Date.now() - t} ms`, res.ok ? `${body.lines.length} lines, ${body.rejected.length} rejected` : body);
