import { catalogue } from "@/lib/catalogue";

export const metadata = { title: "What's real in AgentCart" };

const ROWS: [string, string][] = [
  ["PayPal authorise, capture, void, tracking, webhooks", "Real, in the PayPal sandbox (PAYPAL_MODE=sandbox)."],
  ["Compatibility audit", "Real AI (Gemini) reading the manufacturers' spec sheets. Every verdict quotes the sheet."],
  ["Shipped-model check", "Exact-match code first, then Gemini Flash. A charge needs both the AI and the code to agree."],
  ["Product catalogue", "Curated: real products, prices checked on the date shown for each product."],
  ["Bundle order", "Cheapest compatible part per category, checked in a fixed order, so results are repeatable."],
  ["Merchants", "Sandbox accounts operated by the team through the merchant console."],
];

export default function About() {
  const dates = [...new Set(catalogue.map((p) => p.price_date))].sort();
  return (
    <main className="stack" style={{ maxWidth: 880 }}>
      <div className="panel stack">
        <h1>What&apos;s real and what isn&apos;t</h1>
        <table className="plain">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Catalogue prices checked between {dates[0]} and {dates[dates.length - 1]}.</p>
      </div>
      <div className="panel stack">
        <h2>Not built, not claimed</h2>
        <p>Live retailer stock, multi-retailer search APIs, and real merchant fulfilment.</p>
      </div>
      <div className="panel stack">
        <h2>How we know the AI is right</h2>
        <p>
          Accuracy on our hand-checked test set of real spec-sheet pairings: <strong>not measured yet</strong>. The
          results file will be linked here once the test run is committed.
        </p>
        <p>The AI has no PayPal access. It returns a verdict; only our server code can charge, and only after a verified match.</p>
      </div>
    </main>
  );
}
