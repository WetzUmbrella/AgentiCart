"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, usd } from "@/lib/client";
import type { Order, ShipVerdict, Line } from "@/lib/types";
import { STATE_LABEL } from "@/lib/labels";

type ShipResult = { verdict: ShipVerdict; captured: boolean; capture_id?: string; line: Line };

function Console() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const [order, setOrder] = useState<Order | null>(null);
  const [lineId, setLineId] = useState("");
  const [model, setModel] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const refresh = async (id: string) => {
    try {
      setOrder(await api<Order>(`/api/orders/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.code === "expired") setExpired(true);
    }
  };

  useEffect(() => {
    if (!orderId) return;
    const tick = async () => {
      try {
        setOrder(await api<Order>(`/api/orders/${orderId}`));
      } catch (e) {
        if (e instanceof ApiError && e.code === "expired") setExpired(true);
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [orderId]);

  const open = order?.lines.filter((l) => l.state === "AUTHORISED") ?? [];
  // The chosen part, or the first one still waiting to ship.
  const selected = open.some((l) => l.line_id === lineId) ? lineId : open[0]?.line_id ?? "";

  if (!orderId) {
    return (
      <div className="panel stack">
        <h1>Merchant console</h1>
        <p>Open this page from an approved order on the Shop page. The link carries the order number.</p>
      </div>
    );
  }
  if (expired) {
    return <p className="notice error">This order expired (the demo server restarted or it was reset). Start again on the Shop page.</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<ShipResult>("/api/ship", {
        body: { orderId, line_id: selected, shipped_model: model, tracking_number: tracking, carrier: "Demo Courier" },
      });
      setResult(r);
      setModel("");
      setTracking("");
      refresh(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shipping failed.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    try {
      await api(`/api/orders/${orderId}/close`, { method: "POST" });
      refresh(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish the order.");
    }
  };

  return (
    <div className="workspace">
      <div className="stack">
        <div className="panel stack">
          <h1>Mark a part as shipped</h1>
          <p className="muted">
            Type the exact model printed on the box. The part is charged only if it is the model that was checked.
          </p>
          {order?.status === "CLOSED" ? (
            <p className="notice info">This order is finished. Nothing more can be shipped.</p>
          ) : open.length === 0 ? (
            <p className="notice info">Every part on this order has been processed. Finish the order to release the rest of the hold.</p>
          ) : (
            <form className="stack" onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Part
                  <select value={selected} onChange={(e) => setLineId(e.target.value)}>
                    {open.map((l) => (
                      <option key={l.line_id} value={l.line_id}>
                        {l.name} ({usd(l.amount_cents)})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Carrier
                  <select defaultValue="Demo Courier">
                    <option>Demo Courier</option>
                  </select>
                </label>
                <label>
                  Shipped model
                  <input type="text" value={model} maxLength={64} required onChange={(e) => setModel(e.target.value)} placeholder="e.g. SM58-LC" />
                </label>
                <label>
                  Tracking number
                  <input type="text" value={tracking} maxLength={40} required pattern="[A-Za-z0-9-]{1,40}" onChange={(e) => setTracking(e.target.value)} placeholder="e.g. DEMO123" />
                </label>
              </div>
              <div className="row">
                <button type="submit" disabled={busy || !selected}>{busy ? "Checking the model…" : "Mark shipped"}</button>
              </div>
            </form>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
        </div>

        {result && (
          <div className={`verdict-panel ${result.captured ? "ok" : "no"}`} aria-live="polite">
            <div className="big">
              {result.captured ? `Charged ${usd(result.line.amount_cents)}` : "Not charged"}
            </div>
            <p>{result.verdict.reason}</p>
            {result.line.state === "CAPTURE_FAILED" && <p>{result.line.error}</p>}
            {result.verdict.mock && <p className="small">Mock AI verdict.</p>}
          </div>
        )}
      </div>

      <aside className="panel stack">
        <h2>Order {orderId}</h2>
        <table className="plain small">
          <tbody>
            {order?.lines.map((l) => (
              <tr key={l.line_id}>
                <td>{l.name}</td>
                <td className={`state ${l.state}`}>{STATE_LABEL[l.state]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order && order.status !== "CLOSED" && <button className="secondary" onClick={finish}>Finish order</button>}
        {order?.status === "CLOSED" && <p>Released {usd(order.released_cents ?? 0)} back to the shopper.</p>}
      </aside>
    </div>
  );
}

export default function MerchantPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <Console />
      </Suspense>
    </main>
  );
}
