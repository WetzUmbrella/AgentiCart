import "./_env.mts";
import readline from "readline/promises";
import { restPayPal } from "../lib/paypal";

export const pp = restPayPal;
export const id = (p: string) => `${p}-${Date.now()}`;

export async function waitForApproval(order: { id: string; links?: { href: string; rel: string }[] }) {
  const link = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  console.log(`\nOrder ${order.id}\nOpen this link, log in as the SANDBOX SHOPPER and approve:\n${link}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press Enter after approving... ");
  rl.close();
}

export function evidence(test: string, pass: boolean, detail: string) {
  console.log(`\nResult for docs/go-no-go.md:\n| ${test} | ${pass ? "PASS" : "FAIL"} | ${detail} |`);
}
