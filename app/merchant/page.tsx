"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, usd } from "@/lib/client";
import { preparePhoto, type PreparedPhoto } from "@/lib/image-client";
import { SAMPLE_LABELS, sampleLabelUrl, type SampleLabel } from "@/lib/sample-labels";
import type { Order, ShipVerdict, Line } from "@/lib/types";
import { lineRowState, STATE_LABEL } from "@/lib/labels";
import { canShip, checksLeft } from "@/lib/ship-rules";

type ShipResult = { verdict: ShipVerdict; captured: boolean; capture_id?: string; line: Line; checks_left: number };

const photoUrl = (orderId: string, lineId: string, n?: number) =>
  `/api/orders/${orderId}/photo/${lineId}${n ? `?n=${n}` : ""}`;

/** What the merchant should do about a line, in one short line. */
function lineNote(l: Line): string | null {
  if (l.capture_uncertain) return "Do not ship yet. PayPal has not confirmed this charge.";
  if (l.cancel_reason) return `Can't fulfil: ${l.cancel_reason}`;
  if (l.state === "CAPTURED") return l.error ?? "Charged. Ship this part.";
  if (l.state === "NOT_CHARGED") {
    const left = checksLeft(l);
    return left > 0 ? "Wrong part. Pack the checked model and recheck once." : "Not charged. No checks left.";
  }
  if (l.state === "AUTHORISED" && l.verdict?.unreadable) return "Label unreadable. Retake the photo.";
  return l.error ?? null;
}

/** The headline of the verdict panel. */
function verdictTitle(r: ShipResult): string {
  if (r.captured) return `Charged ${usd(r.line.amount_cents)}`;
  if (r.line.capture_uncertain) return "Do not ship yet";
  if (r.verdict.unreadable) return "Label unreadable";
  return "Not charged";
}

function Console() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const [order, setOrder] = useState<Order | null>(null);
  const [lineId, setLineId] = useState("");
  const [model, setModel] = useState("");
  const [tracking, setTracking] = useState("");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  // Set only while the photo is one of the team's sample labels (mock AI can read those by id).
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // "Can't fulfil": open while the merchant is confirming, with an optional reason.
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // The verdict is the moment that matters on video: bring it into view.
  useEffect(() => {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

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

  const open = order?.lines.filter(canShip) ?? [];
  // The chosen part, or the first one still waiting to ship.
  const selected = open.some((l) => l.line_id === lineId) ? lineId : open[0]?.line_id ?? "";
  const selectedLine = open.find((l) => l.line_id === selected);
  const isRecheck = selectedLine?.state === "NOT_CHARGED";

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

  const attachPhoto = async (blob: Blob, sample: SampleLabel | null) => {
    setPreparing(true);
    setError(null);
    try {
      setPhoto(await preparePhoto(blob));
      setSampleId(sample?.id ?? null);
      if (sample) setModel(sample.declared);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that photo.");
    } finally {
      setPreparing(false);
    }
  };

  const pickSample = async (sample: SampleLabel) => {
    const res = await fetch(sampleLabelUrl(sample.id));
    await attachPhoto(await res.blob(), sample);
  };

  const clearPhoto = () => {
    setPhoto(null);
    setSampleId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<ShipResult>("/api/ship", {
        body: {
          orderId,
          line_id: selected,
          shipped_model: model,
          tracking_number: tracking,
          carrier: "Demo Courier",
          photo: photo.photo,
          ...(sampleId ? { sample_label: sampleId } : {}),
        },
      });
      setResult(r);
      setLineId(r.line.line_id); // a blocked part with a recheck left stays selected
      setModel("");
      if (r.captured) setTracking("");
      clearPhoto();
      refresh(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shipping failed.");
      refresh(orderId);
    } finally {
      setBusy(false);
    }
  };

  const cancelPart = async () => {
    if (!selectedLine) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/cancel-line", { body: { orderId, line_id: selectedLine.line_id, reason: cancelReason } });
      setCancelling(false);
      setCancelReason("");
      setResult(null);
      refresh(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this part.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await api(`/api/orders/${orderId}/close`, { method: "POST" });
    } catch (err) {
      // 409 still processing, 502 release failed, 503 PayPal unreachable: the order stays open; Finish can be retried.
      setFinishError(err instanceof Error ? err.message : "Could not finish the order.");
    } finally {
      setFinishing(false);
      refresh(orderId);
    }
  };

  return (
    <div className="workspace">
      <div className="stack">
        {result && (
          <div
            ref={resultRef}
            className={`verdict-panel ${result.captured ? "ok" : result.line.capture_uncertain ? "warn" : "no"}`}
            aria-live="polite"
          >
            <div className="big">{verdictTitle(result)}</div>
            <div className="verdict-evidence">
              {/* eslint-disable-next-line @next/next/no-img-element -- evidence photo served by our API */}
              <img
                src={photoUrl(orderId, result.line.line_id, result.line.photo_count)}
                alt={`Label photo for ${result.line.name}`}
              />
              <div className="stack" style={{ gap: 6 }}>
                <p>
                  <strong>{result.line.name}</strong>
                </p>
                <p>
                  <strong>Label reads:</strong> {result.verdict.label_text ? `“${result.verdict.label_text}”` : "unreadable"}
                </p>
                <p>{result.verdict.reason}</p>
                {result.line.state === "CAPTURE_FAILED" && <p><strong>{result.line.error}</strong></p>}
                {!result.captured && result.verdict.unreadable && (
                  <p className="small">This check was not counted. Take a clearer photo of the label and try again.</p>
                )}
                {!result.captured && !result.verdict.unreadable && result.line.state === "NOT_CHARGED" && (
                  <p className="small">
                    {result.checks_left > 0
                      ? "Pack the checked model and recheck it once, or mark the part as one you can't fulfil."
                      : "No checks left. This part won't be charged; its hold is released when the order is finished."}
                  </p>
                )}
                {result.verdict.mock && <p className="small muted">Mock AI verdict.</p>}
              </div>
            </div>
          </div>
        )}
        <div className="panel stack">
          <h1>{isRecheck ? "Recheck a repacked part" : "Mark a part as shipped"}</h1>
          <p className="muted">
            Photograph the label on the box and enter the model you are shipping. The part is charged only if the photo
            shows exactly the model that was checked.
          </p>
          {order?.status === "CLOSED" ? (
            <p className="notice info">This order is finished. Nothing more can be shipped.</p>
          ) : !order ? (
            <p className="muted">Loading the order…</p>
          ) : open.length === 0 ? (
            <p className="notice info">Every part on this order has been processed. Finish the order to release the rest of the hold.</p>
          ) : (
            <form className="stack" onSubmit={submit}>
              <fieldset className="photo-field">
                <legend>Label photo</legend>
                {photo ? (
                  <div className="photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                    <img src={photo.preview} alt="Box label to be checked" />
                    <button type="button" className="secondary" onClick={clearPhoto}>Remove photo</button>
                  </div>
                ) : (
                  <>
                    <label className="photo-drop">
                      <span>{preparing ? "Preparing photo…" : "Take or choose a photo of the box label"}</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        disabled={preparing}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) attachPhoto(f, null);
                        }}
                      />
                    </label>
                    <div className="samples">
                      <span className="small muted">Or use a sample label made for the demo:</span>
                      <div className="sample-list">
                        {SAMPLE_LABELS.map((s) => (
                          <button type="button" key={s.id} className="sample" disabled={preparing} onClick={() => pickSample(s)}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- small static sample */}
                            <img src={sampleLabelUrl(s.id)} alt="" />
                            <span>{s.caption}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </fieldset>
              <div className="form-grid">
                <label>
                  Part
                  <select
                    value={selected}
                    onChange={(e) => {
                      setLineId(e.target.value);
                      setCancelling(false);
                    }}
                  >
                    {open.map((l) => (
                      <option key={l.line_id} value={l.line_id}>
                        {l.name} ({usd(l.amount_cents)}){l.state === "NOT_CHARGED" ? " · recheck" : ""}
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
                  Model you are shipping
                  <input type="text" value={model} maxLength={64} required onChange={(e) => setModel(e.target.value)} placeholder="e.g. SM58-LC" />
                </label>
                <label>
                  Tracking number
                  <input type="text" value={tracking} maxLength={40} required pattern="[A-Za-z0-9\-]{1,40}" onChange={(e) => setTracking(e.target.value)} placeholder="e.g. DEMO123" />
                </label>
              </div>
              {isRecheck && selectedLine && (
                <p className="notice warn small">
                  The last check found the wrong part. This is the last check for {selectedLine.name}: if the label still
                  doesn&apos;t show the checked model, the part is not charged.
                </p>
              )}
              <div className="row form-actions">
                <button type="submit" disabled={busy || preparing || !selected || !photo}>
                  {busy && !cancelling ? "Reading the label…" : isRecheck ? "Recheck" : "Mark shipped"}
                </button>
                {!photo && <span className="small muted">Add a label photo first.</span>}
                <button
                  type="button"
                  className="quiet push-right"
                  disabled={busy || !selectedLine}
                  onClick={() => setCancelling((c) => !c)}
                  aria-expanded={cancelling}
                >
                  Can&apos;t fulfil this part
                </button>
              </div>
              {cancelling && selectedLine && (
                <div className="cancel-box stack" role="group" aria-label="Can't fulfil this part">
                  <p className="small">
                    <strong>{selectedLine.name}</strong> will not be charged, and its share of the hold is released when the
                    order is finished. This can&apos;t be undone.
                  </p>
                  <label>
                    Reason (optional, shown to the shopper)
                    <input
                      type="text"
                      value={cancelReason}
                      maxLength={120}
                      placeholder="e.g. Out of stock"
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </label>
                  <div className="row">
                    <button type="button" className="danger" disabled={busy} onClick={cancelPart}>
                      {busy ? "Cancelling…" : "Don't charge this part"}
                    </button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setCancelling(false)}>
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
        </div>
      </div>

      <aside className="panel stack">
        <div className="stack" style={{ gap: 4 }}>
          <h2>Order</h2>
          <span className="small muted order-id">{orderId}</span>
        </div>
        <ul className="order-lines">
          {order?.lines.map((l) => {
            const rs = lineRowState(l);
            const note = lineNote(l);
            const photos = l.attempts?.length ?? 0;
            return (
              <li key={l.line_id}>
                <div className="order-line-head">
                  <span>{l.name}</span>
                  <span className={`state ${rs}`}>{STATE_LABEL[rs]}</span>
                </div>
                {note && <span className={`small ${l.capture_uncertain ? "note-warn" : "muted"}`}>{note}</span>}
                {photos > 0 && (
                  <span className="small muted">
                    Label {photos === 1 ? "photo" : "photos"}:{" "}
                    {l.attempts!.map((a, i) => (
                      <span key={a.photo}>
                        {i > 0 && " · "}
                        <a href={photoUrl(orderId, l.line_id, a.photo)} target="_blank" rel="noreferrer">
                          {a.verdict.action === "CAPTURE" ? "matched" : a.verdict.unreadable ? "unreadable" : "wrong part"}
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {finishError && <p className="notice error small" role="alert">{finishError}</p>}
        {order && order.status !== "CLOSED" && (
          <button className="secondary" onClick={finish} disabled={finishing}>
            {finishing ? "Finishing…" : finishError ? "Try Finish again" : "Finish order"}
          </button>
        )}
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
