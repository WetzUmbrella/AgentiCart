"use client";
import { usd } from "@/lib/client";
import type { SearchOutcome, SearchReceipt as Receipt } from "@/lib/types";

const OUTCOME: Record<SearchOutcome, { mark: string; label: string }> = {
  picked: { mark: "✓", label: "Picked" },
  rejected: { mark: "✕", label: "Failed the check" },
  not_tried: { mark: "–", label: "Not needed" },
  filtered_out: { mark: "–", label: "Ruled out" },
};

const CATEGORY: Record<string, string> = {
  interface: "Interface",
  microphone: "Microphone",
  cable: "Cable",
  stand: "Stand",
  headphones: "Headphones",
};

/** Every product the builder considered, so the ranking can be checked rather than trusted. */
export default function SearchReceipt({ receipt, swapped }: { receipt: Receipt; swapped: boolean }) {
  const all = receipt.steps.flatMap((s) => s.candidates);
  const count = (o: SearchOutcome) => all.filter((c) => c.outcome === o).length;
  const audited = count("picked") + count("rejected");
  return (
    <section className="panel stack receipt" aria-labelledby="receipt-title">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="receipt-title">How these parts were picked</h2>
        <p className="small">{receipt.rule}</p>
        <p className="small muted">
          Looked at {all.length} of {receipt.catalogue_size} catalogue products. {audited} went through the compatibility
          check and {count("rejected")} failed it. {count("filtered_out")} were ruled out by their listing, and{" "}
          {count("not_tried")} weren&apos;t needed because a cheaper part already fit.
        </p>
        {swapped && (
          <p className="small muted">This shows how the bundle was first built. Parts you swapped in were checked on their own.</p>
        )}
      </div>
      <div className="receipt-steps">
        {receipt.steps.map((step) => (
          <details key={step.category} open={step.candidates.some((c) => c.outcome === "rejected")}>
            <summary>
              <span className="receipt-cat">{CATEGORY[step.category] ?? step.category}</span>
              <span className="receipt-trail">
                {step.candidates
                  .filter((c) => c.outcome === "picked" || c.outcome === "rejected")
                  .map((c) => (
                    <span key={c.product_id} className={`chip ${c.outcome}`}>
                      <span aria-hidden="true">{OUTCOME[c.outcome].mark} </span>
                      {c.name}
                    </span>
                  ))}
                {step.candidates.length > 0 && !step.candidates.some((c) => c.outcome === "picked") && (
                  <span className="chip rejected">Nothing in the catalogue fits</span>
                )}
              </span>
              <span className="receipt-count small muted">{step.candidates.length} considered</span>
            </summary>
            <table className="plain small">
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col">Result</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {step.candidates.map((c) => (
                  <tr key={c.product_id} className={`outcome-${c.outcome}`}>
                    <td>{c.name}</td>
                    <td className="num">{usd(Math.round(c.price_usd * 100))}</td>
                    <td className="outcome">{OUTCOME[c.outcome].label}</td>
                    <td>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
    </section>
  );
}
