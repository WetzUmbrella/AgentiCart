import { RANKING_RULE } from "@/lib/bundle";
import { catalogue } from "@/lib/catalogue";

export const metadata = { title: "What's real in AgentCart" };

const SOURCE = "https://github.com/WetzUmbrella/AgentiCart/blob/main";

const ROWS: [string, string][] = [
  ["PayPal authorise, capture, void, tracking, webhooks", "Real, in the PayPal sandbox (PAYPAL_MODE=sandbox)."],
  ["Compatibility audit", "Real AI (Gemini) reading the manufacturers' spec sheets. Every verdict quotes the sheet."],
  [
    "Shipment label check",
    "Real AI (Gemini Flash) reads a photo of the box label. A charge needs the label, the AI and the merchant's declared model to agree on the exact variant. The demo uses sample labels made by the team.",
  ],
  ["Product catalogue", "Curated: real products, prices checked on the date shown for each product."],
  ["Bundle order", "Cheapest compatible part per category, checked in a fixed order, so results are repeatable."],
  ["Confidence", "Worked out by our server from checks you can repeat, not the AI rating its own answer."],
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
        <h2>How AgentCart ranks parts</h2>
        <p>{RANKING_RULE}</p>
        <p>
          Every bundle comes with a list of each product we looked at and what happened to it, so you can check the
          ranking instead of trusting it. The ranking code is open source:{" "}
          <a href={`${SOURCE}/lib/bundle.ts`}>lib/bundle.ts</a>.
        </p>
        <p>
          The money follows the same rule. PayPal holds your payment when you approve, and the seller is paid for a part
          only when the model they ship is the one that was checked. Anything else is never charged.
        </p>
      </div>
      <div className="panel stack">
        <h2>How confidence is worked out</h2>
        <p>Each compatibility verdict gets a level from three checks:</p>
        <table className="plain">
          <tbody>
            <tr>
              <th scope="row">Spec-sheet quotes</th>
              <td>
                Every quote the AI relies on is looked up in the text of the manufacturer&apos;s spec sheet and linked to
                its source. Image spec sheets can&apos;t be read automatically, so their quotes are marked &ldquo;not
                auto-checked&rdquo;, never &ldquo;found&rdquo;.
              </td>
            </tr>
            <tr>
              <th scope="row">Hand-checked spec data</th>
              <td>
                Our team copied the key specs (connectors, phantom power, mic inputs) from each sheet by hand. The AI
                never sees them. The server compares them with the AI&apos;s verdict.
              </td>
            </tr>
            <tr>
              <th scope="row">AI&apos;s own rating</th>
              <td>Shown for reference. A low rating lowers the level; a high one never raises it.</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>High</strong> means every quote was found and the hand-checked data agrees. <strong>Low</strong>{" "}
          means a check failed, and that part is left out of your PayPal approval until you keep it or swap it.
          Anything else is <strong>medium</strong>. We don&apos;t show percentages: the checks are pass or fail, and a
          number would claim more precision than we have. Code: <a href={`${SOURCE}/lib/trust.ts`}>lib/trust.ts</a>.
        </p>
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
