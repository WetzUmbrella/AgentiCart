"use client";
import { useEffect, useState } from "react";
import { api, usd } from "@/lib/client";
import type { PublicProduct } from "@/lib/catalogue";
import type { GridRow } from "./BundleGrid";

/** Lists other products in the same category, with the new total and a budget check. */
export default function SwapPanel({
  row,
  currentTotal,
  budgetCents,
  onPick,
  onClose,
}: {
  row: GridRow;
  currentTotal: number;
  budgetCents: number | null;
  onPick: (p: PublicProduct) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<PublicProduct[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    api<PublicProduct[]>("/api/catalogue")
      .then((all) => setOptions(all.filter((p) => p.category === row.category && p.id !== row.product_id)))
      .catch(() => setOptions([]));
  }, [row.category, row.product_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Swap ${row.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Swap {row.name}</h2>
          <button className="quiet" onClick={onClose}>Close</button>
        </div>
        <p className="muted small">Only this row is re-checked against the rest of your bundle.</p>
        {options === null && <p>Loading alternatives…</p>}
        {options?.length === 0 && <p>No other {row.category} in the demo catalogue.</p>}
        {options?.map((p) => {
          const base = row.state === "REJECTED" ? currentTotal : currentTotal - row.amount_cents;
          const newTotal = base + Math.round(p.price_usd * 100) * row.qty;
          const over = budgetCents !== null && newTotal > budgetCents;
          return (
            <div className="option" key={p.id}>
              <div>
                <strong>{p.brand} {p.variant}</strong>
                <div className="small muted">
                  {usd(Math.round(p.price_usd * 100))} each, new bundle total {usd(newTotal)}
                  {over && <span style={{ color: "var(--rejected)" }}>. Over your budget</span>}
                </div>
              </div>
              {over && confirming !== p.id ? (
                <button className="secondary" onClick={() => setConfirming(p.id)}>Choose anyway</button>
              ) : (
                <button onClick={() => onPick(p)}>Choose</button>
              )}
              <span />
            </div>
          );
        })}
      </div>
    </div>
  );
}
