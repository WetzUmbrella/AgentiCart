"use client";
import { usd } from "@/lib/client";
import type { Totals } from "@/lib/totals";

/** The money story: what is held, what was charged, what was released. */
export default function Ledger({ totals, planned, closed }: { totals: Totals; planned: number; closed: boolean }) {
  const base = totals.authorised || 1;
  const pct = (c: number) => `${Math.max(0, Math.min(100, (c / base) * 100))}%`;
  const released = totals.released ?? 0;
  return (
    <aside className="panel ledger" aria-label="Payment summary">
      <h2>Your money</h2>
      {totals.authorised === 0 ? (
        <p className="muted">
          Nothing is held or charged yet. Bundle total {usd(planned)}. When you approve, PayPal holds this amount and
          charges each part only after its shipped model is confirmed.
        </p>
      ) : (
        <div className="meter" role="img" aria-label="Charged, held and released share of the approved amount">
          <span className="m-charged" style={{ width: pct(totals.charged) }} />
          <span className="m-held" style={{ width: pct(totals.held) }} />
          <span className="m-released" style={{ width: pct(released) }} />
        </div>
      )}
      <div className="figures">
        <div className="figure authorised">
          <i style={{ border: "2px solid var(--muted)" }} />
          <span className="label">Approved with PayPal</span>
          <span className="value">{usd(totals.authorised)}</span>
        </div>
        <div className="figure">
          <i style={{ background: "var(--charged)" }} />
          <span className="label">Charged</span>
          <span className="value">{usd(totals.charged)}</span>
        </div>
        {!closed && (
          <div className="figure">
            <i style={{ background: "var(--held)" }} />
            <span className="label">Held, not charged</span>
            <span className="value">{usd(totals.held)}</span>
          </div>
        )}
        {!closed && totals.notCharged > 0 && (
          <p className="small muted">
            {usd(totals.notCharged)} of that is for parts that failed the check. It is released when you finish the
            order.
          </p>
        )}
        {closed && (
          <div className="figure">
            <i style={{ background: "var(--released)" }} />
            <span className="label">Released to you</span>
            <span className="value">{usd(released)}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
