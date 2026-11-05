"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BuildProgress, { applyProgress, startProgress, type Progress } from "@/components/BuildProgress";
import BundleGrid, { type GridRow } from "@/components/BundleGrid";
import Ledger from "@/components/Ledger";
import PayButton from "@/components/PayButton";
import SearchReceipt from "@/components/SearchReceipt";
import SwapPanel from "@/components/SwapPanel";
import { useConfig } from "@/components/useConfig";
import { api, ApiError, apiStream, usd } from "@/lib/client";
import type { PublicProduct } from "@/lib/catalogue";
import { lineRowState, storeLabel } from "@/lib/labels";
import { totalsFor } from "@/lib/totals";
import type { AuditVerdict, BundleLine, BundleProgress, BundleResponse, Line, Order } from "@/lib/types";

const DEMO_GOAL = "Podcast setup for 2 people under $900";
const cents = (usdValue: number) => Math.round(usdValue * 100);

/** What the shopper is told about a part after approval. Merchant wording ("do not ship") stays on the console. */
function shopperNote(l: Line): string | undefined {
  if (l.capture_uncertain) return "PayPal is confirming whether this part was charged. It is settled before anything is released.";
  if (l.cancel_reason) return `The store can't supply this part (${l.cancel_reason}). It won't be charged.`;
  if (l.state === "CAPTURED") return undefined;
  if (l.state === "AUTHORISED" && l.verdict?.unreadable) return "The store's label photo was unreadable. They are retaking it.";
  return l.error ?? l.verdict?.reason;
}

export default function ShopperPage() {
  const cfg = useConfig();
  const [goal, setGoal] = useState(DEMO_GOAL);
  const [bundle, setBundle] = useState<BundleResponse | null>(null);
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [rechecking, setRechecking] = useState<string | null>(null);
  // Low-trust lines stay out of the PayPal approval until the shopper keeps them (or swaps them).
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [swapped, setSwapped] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [swapRow, setSwapRow] = useState<GridRow | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const loading = progress !== null;
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
    setProgress(startProgress());
    setError(null);
    setNotice(null);
    try {
      const b = await apiStream<BundleResponse, BundleProgress>("/api/bundle?stream=1", { goal }, "bundle", (e) =>
        setProgress((p) => (p ? applyProgress(p, e) : p)),
      );
      setBundle(b);
      setLines(b.lines);
      setConfirmed(new Set());
      setSwapped(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a bundle.");
    } finally {
      setProgress(null);
    }
  };

  const startOver = async () => {
    setNotice(null);
    if (orderId && order?.status !== "CLOSED") {
      // Reset releases the hold first. If PayPal can't confirm that, the order is kept and auto-closed (R-S2).
      const r = await api<{ cleared: boolean; deferred?: boolean }>("/api/reset", { body: { orderId } }).catch(() => null);
      if (!r || r.deferred) {
        setNotice(
          "PayPal did not confirm that your held money was released. Nothing extra was charged, and the hold is released automatically within 24 hours.",
        );
      }
    } else if (orderId) {
      await api("/api/reset", { body: { orderId } }).catch(() => undefined);
    }
    setBundle(null);
    setLines([]);
    setConfirmed(new Set());
    setSwapped(false);
    setOrderId(null);
    setOrder(null);
    setFinishFailed(false);
    setExpired(false);
    setError(null);
  };

  const needsConfirm = useCallback(
    (l: BundleLine) => l.verdict?.compatible !== false && l.verdict?.trust?.level === "low" && !confirmed.has(l.line_id),
    [confirmed],
  );
  const payable = lines.filter((l) => l.verdict?.compatible !== false && !needsConfirm(l));
  const heldOut = lines.filter(needsConfirm).length;
  const plannedCents = payable.reduce((s, l) => s + cents(l.product.price_usd) * l.qty, 0);
  const budgetCents = bundle?.constraints.budget_usd != null ? cents(bundle.constraints.budget_usd) : null;

  const rows: GridRow[] = useMemo(() => {
    const out: GridRow[] = lines.map((l) => {
      const ol = order?.lines.find((x) => x.line_id === l.line_id);
      const fits = l.verdict?.compatible ?? null;
      const state = fits === false
        ? "REJECTED"
        : ol
          ? lineRowState(ol)
          : orderId
            ? "LEFT_OUT"
            : needsConfirm(l)
              ? "NEEDS_CONFIRM"
              : "NOT_PAID";
      return {
        key: l.line_id,
        line_id: l.line_id,
        product_id: l.product.id,
        category: l.product.category,
        name: `${l.product.brand} ${l.product.variant}`,
        merchant: storeLabel(l.product.merchant),
        qty: l.qty,
        amount_cents: cents(l.product.price_usd) * l.qty,
        compatible: rechecking === l.line_id ? null : fits,
        reason: rechecking === l.line_id ? "Re-checking against the rest of your bundle…" : l.verdict?.reason ?? "",
        evidence: rechecking === l.line_id ? [] : l.verdict?.evidence ?? [],
        trust: rechecking === l.line_id ? undefined : l.verdict?.trust,
        state,
        payment_note: ol ? shopperNote(ol) : undefined,
        tracking: ol?.tracking_number,
        label_text: ol?.verdict ? ol.verdict.label_text ?? "" : undefined,
        photo_url: ol?.has_photo && orderId ? `/api/orders/${orderId}/photo/${l.line_id}` : undefined,
      };
    });
    for (const r of bundle?.rejected ?? []) {
      out.push({
        key: `rejected-${r.product.id}`,
        product_id: r.product.id,
        category: r.product.category,
        name: `${r.product.brand} ${r.product.variant}`,
        merchant: storeLabel(r.product.merchant),
        qty: 0,
        amount_cents: 0,
        compatible: false,
        reason: r.verdict.reason,
        evidence: r.verdict.evidence,
        trust: r.verdict.trust,
        state: "REJECTED",
      });
    }
    return out;
  }, [lines, order, bundle, rechecking, needsConfirm, orderId]);

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
        setConfirmed((c) => {
          const next = new Set(c);
          next.delete(row.line_id!);
          return next;
        });
        setSwapped(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Re-check failed.");
      } finally {
        setRechecking(null);
      }
    },
    [swapRow, lines],
  );

  const keep = useCallback((lineId: string) => setConfirmed((c) => new Set(c).add(lineId)), []);

  const finish = async () => {
    if (!orderId) return;
    setError(null);
    setFinishing(true);
    try {
      const r = await api<{ order: Order }>(`/api/orders/${orderId}/close`, { method: "POST" });
      setOrder(r.order);
      setFinishFailed(false);
    } catch (e) {
      // 409 still processing, 502 release failed, 503 PayPal unreachable: the order stays open and Finish can be retried.
      setError(e instanceof Error ? e.message : "Could not finish the order.");
      setFinishFailed(true);
      if (e instanceof ApiError && e.body.order) setOrder(e.body.order as Order);
    } finally {
      setFinishing(false);
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
          <ul className="promise" aria-label="How AgentCart is different">
            <li>
              <strong>No paid placement</strong>
              <span>The cheapest part that passes the check wins. You can see every part we looked at.</span>
            </li>
            <li>
              <strong>Reasons you can check</strong>
              <span>Each verdict quotes the spec sheet, and links to the manufacturer&apos;s page.</span>
            </li>
            <li>
              <strong>Seller paid only for verified parts</strong>
              <span>PayPal holds your money. A part is charged only when the model shipped is the one we checked.</span>
            </li>
          </ul>
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

        {progress && <BuildProgress progress={progress} />}
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice info" role="status">{notice}</p>}
        {expired && (
          <p className="notice error" role="alert">
            This order expired (the demo server restarted or it was reset). Press Start over to try again.
          </p>
        )}

        {bundle && (
          <div className="stack">
            <BundleGrid rows={rows} onSwap={setSwapRow} onConfirm={keep} canSwap={!orderId && !rechecking} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted small">
                Demo catalogue: real products, prices checked on the dates shown in the catalogue.
              </span>
              <button className="secondary" onClick={startOver}>Start over</button>
            </div>
            <SearchReceipt receipt={bundle.search} swapped={swapped} />
          </div>
        )}
      </section>

      <div className={`stack side${authorised ? " sticky" : ""}`}>
        <Ledger totals={totals} planned={plannedCents} closed={closed} />
        {bundle && !orderId && cfg && (
          <div className="panel stack">
            <h2>Approve once</h2>
            <p className="small muted">
              PayPal holds {usd(plannedCents)}. Nothing is charged until a part ships and its model is confirmed.
            </p>
            {heldOut > 0 && (
              <p className="notice warn small">
                {heldOut === 1 ? "1 low-confidence part is" : `${heldOut} low-confidence parts are`} left out of this
                approval. Open its confidence details, then keep it or swap it.
              </p>
            )}
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
                <button onClick={finish} disabled={finishing}>
                  {finishing ? "Finishing…" : finishFailed ? "Try Finish again" : "Finish order"}
                </button>
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
