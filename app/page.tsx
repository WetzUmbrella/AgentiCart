"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BundleGrid, { type GridRow } from "@/components/BundleGrid";
import Ledger from "@/components/Ledger";
import PayButton from "@/components/PayButton";
import SwapPanel from "@/components/SwapPanel";
import { useConfig } from "@/components/useConfig";
import { api, ApiError, usd } from "@/lib/client";
import type { PublicProduct } from "@/lib/catalogue";
import { totalsFor } from "@/lib/totals";
import type { AuditVerdict, BundleLine, BundleResponse, Order } from "@/lib/types";

const DEMO_GOAL = "Podcast setup for 2 people under $900";
const cents = (usdValue: number) => Math.round(usdValue * 100);

function quoteOf(v: AuditVerdict | null): string | undefined {
  return v?.evidence?.find((e) => e.quote)?.quote;
}

export default function ShopperPage() {
  const cfg = useConfig();
  const [goal, setGoal] = useState(DEMO_GOAL);
  const [bundle, setBundle] = useState<BundleResponse | null>(null);
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [swapRow, setSwapRow] = useState<GridRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Poll the order every 2 seconds until it is closed.
  useEffect(() => {
    if (!orderId || order?.status === "CLOSED" || expired) return;
    let stop = false;
    const tick = async () => {
      try {
        const o = await api<Order>(`/api/orders/${orderId}`);
        if (!stop) setOrder(o);
      } catch (e) {
        if (e instanceof ApiError && e.code === "expired") setExpired(true);
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orderId, order?.status, expired]);

  const build = async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await api<BundleResponse>("/api/bundle", { body: { goal } });
      setBundle(b);
      setLines(b.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a bundle.");
    } finally {
      setLoading(false);
    }
  };

  const startOver = async () => {
    if (orderId) await api("/api/reset", { body: { orderId } }).catch(() => undefined);
    setBundle(null);
    setLines([]);
    setOrderId(null);
    setOrder(null);
    setExpired(false);
    setError(null);
  };

  const payable = lines.filter((l) => l.verdict?.compatible !== false);
  const plannedCents = payable.reduce((s, l) => s + cents(l.product.price_usd) * l.qty, 0);
  const budgetCents = bundle?.constraints.budget_usd != null ? cents(bundle.constraints.budget_usd) : null;

  const rows: GridRow[] = useMemo(() => {
    const out: GridRow[] = lines.map((l) => {
      const ol = order?.lines.find((x) => x.line_id === l.line_id);
      const fits = l.verdict?.compatible ?? null;
      return {
        key: l.line_id,
        line_id: l.line_id,
        product_id: l.product.id,
        category: l.product.category,
        name: `${l.product.brand} ${l.product.variant}`,
        merchant: l.product.merchant.replace("merchant_", "Store "),
        qty: l.qty,
        amount_cents: cents(l.product.price_usd) * l.qty,
        compatible: rechecking === l.line_id ? null : fits,
        reason: rechecking === l.line_id ? "Re-checking against the rest of your bundle…" : l.verdict?.reason ?? "",
        quote: quoteOf(l.verdict),
        state: fits === false ? "REJECTED" : ol ? ol.state : "NOT_PAID",
        payment_note: ol?.state === "CAPTURED" ? undefined : ol?.error ?? ol?.verdict?.reason,
        tracking: ol?.tracking_number,
      };
    });
    for (const r of bundle?.rejected ?? []) {
      out.push({
        key: `rejected-${r.product.id}`,
        product_id: r.product.id,
        category: r.product.category,
        name: `${r.product.brand} ${r.product.variant}`,
        merchant: r.product.merchant.replace("merchant_", "Store "),
        qty: 0,
        amount_cents: 0,
        compatible: false,
        reason: r.verdict.reason,
        quote: quoteOf(r.verdict),
        state: "REJECTED",
      });
    }
    return out;
  }, [lines, order, bundle, rechecking]);

  const swap = useCallback(
    async (p: PublicProduct) => {
      const row = swapRow;
      setSwapRow(null);
      if (!row?.line_id) return;
      setRechecking(row.line_id);
      setError(null);
      try {
        const others = lines.filter((l) => l.line_id !== row.line_id && l.verdict?.compatible !== false).map((l) => l.product.id);
        const verdict = await api<AuditVerdict>("/api/audit", { body: { bundle: others, check: p.id } });
        setLines((ls) => ls.map((l) => (l.line_id === row.line_id ? { ...l, product: p, verdict } : l)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Re-check failed.");
      } finally {
        setRechecking(null);
      }
    },
    [swapRow, lines],
  );

  const finish = async () => {
    if (!orderId) return;
    setError(null);
    try {
      const r = await api<{ order: Order }>(`/api/orders/${orderId}/close`, { method: "POST" });
      setOrder(r.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish the order.");
    }
  };

  const totals = totalsFor(order);
  const closed = order?.status === "CLOSED";
  const authorised = order && order.status !== "CREATED";

  return (
    <main className="workspace">
      <section className="stack">
        <div className="panel stack">
          <h1>What are you setting up?</h1>
          <p className="muted">
            AgentCart picks parts from real manufacturer spec sheets and rejects anything that won&apos;t work together.
          </p>
          <form
            className="goal"
            onSubmit={(e) => {
              e.preventDefault();
              build();
            }}
          >
            <input
              type="text"
              aria-label="Your goal"
              value={goal}
              maxLength={300}
              onChange={(e) => setGoal(e.target.value)}
              disabled={!!orderId}
            />
            <button type="submit" disabled={loading || !!orderId || goal.trim().length < 3}>
              {loading ? "Reading spec sheets…" : "Build my bundle"}
            </button>
          </form>
          {bundle?.mock && (
            <p className="notice warn small">
              Mock AI: verdicts come from hand-filled test data, not from reading spec sheets. Use AI_MODE=live for the demo.
            </p>
          )}
          {bundle?.budget_warning && <p className="notice warn">{bundle.budget_warning}</p>}
        </div>

        {error && <p className="notice error" role="alert">{error}</p>}
        {expired && (
          <p className="notice error" role="alert">
            This order expired (the demo server restarted or it was reset). Press Start over to try again.
          </p>
        )}

        {bundle && (
          <div className="stack">
            <BundleGrid rows={rows} onSwap={setSwapRow} canSwap={!orderId && !rechecking} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted small">
                Demo catalogue: real products, prices checked on the dates shown in the catalogue.
              </span>
              <button className="secondary" onClick={startOver}>Start over</button>
            </div>
          </div>
        )}
      </section>

      <div className="stack">
        <Ledger totals={totals} planned={plannedCents} closed={closed} />
        {bundle && !orderId && cfg && (
          <div className="panel stack">
            <h2>Approve once</h2>
            <p className="small muted">
              PayPal holds {usd(plannedCents)}. Nothing is charged until a part ships and its model is confirmed.
            </p>
            <PayButton
              lines={payable.map((l) => ({ line_id: l.line_id, product_id: l.product.id, qty: l.qty }))}
              mode={cfg.paypalMode}
              clientId={cfg.clientId}
              disabled={payable.length === 0 || !!rechecking}
              onAuthorised={(id) => {
                setOrderId(id);
                setError(null);
              }}
              onError={setError}
            />
          </div>
        )}
        {authorised && orderId && (
          <div className="panel stack">
            <h2>{closed ? "Order finished" : "Waiting for parts to ship"}</h2>
            {!closed && (
              <>
                <p className="small muted">
                  Each part is charged only when the merchant ships the exact model that was checked.
                </p>
                <Link className="button secondary" href={`/merchant?order=${orderId}`} target="_blank">
                  Open merchant console
                </Link>
                <button onClick={finish}>Finish order</button>
              </>
            )}
            {closed && <p>You paid {usd(totals.charged)}. The rest of the hold was released.</p>}
            <p className="small muted">Order {orderId}</p>
          </div>
        )}
      </div>

      {swapRow && (
        <SwapPanel
          row={swapRow}
          currentTotal={plannedCents}
          budgetCents={budgetCents}
          onPick={swap}
          onClose={() => setSwapRow(null)}
        />
      )}
    </main>
  );
}
