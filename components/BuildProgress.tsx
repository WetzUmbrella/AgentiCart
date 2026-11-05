"use client";
import { useEffect, useState } from "react";
import type { BundleProgress } from "@/lib/types";
import { CATEGORY } from "./SearchReceipt";

type CategoryState = {
  status: "waiting" | "checking" | "picked" | "none";
  product?: string;
  against?: string[];
  rejected: string[];
};

export type Progress = { started: number; categories: string[]; byCategory: Record<string, CategoryState> };

export const startProgress = (): Progress => ({ started: Date.now(), categories: [], byCategory: {} });

/** Folds one streamed event from /api/bundle?stream=1 into the progress shown to the shopper. */
export function applyProgress(p: Progress, e: BundleProgress): Progress {
  if (e.type === "goal") {
    const byCategory = Object.fromEntries(e.categories.map((c) => [c, { status: "waiting", rejected: [] } as CategoryState]));
    return { ...p, categories: e.categories, byCategory };
  }
  const prev = p.byCategory[e.type === "step" ? e.step.category : e.category] ?? { status: "waiting", rejected: [] };
  if (e.type === "checking") {
    // A new audit in the same category means the previous candidate failed.
    const rejected = prev.status === "checking" && prev.product ? [...prev.rejected, prev.product] : prev.rejected;
    return {
      ...p,
      byCategory: { ...p.byCategory, [e.category]: { status: "checking", product: e.product, against: e.against, rejected } },
    };
  }
  const rejected = e.step.candidates.filter((c) => c.outcome === "rejected").map((c) => c.name);
  return {
    ...p,
    byCategory: {
      ...p.byCategory,
      [e.step.category]: { status: e.picked ? "picked" : "none", product: e.picked ?? undefined, rejected },
    },
  };
}

const MARK = { waiting: "", checking: "", picked: "✓", none: "✕" } as const;

/** One live bundle build takes about a minute: show which part is being checked against what. */
export default function BuildProgress({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - progress.started) / 1000));
  const done = progress.categories.filter((c) => progress.byCategory[c]?.status === "picked" || progress.byCategory[c]?.status === "none").length;

  return (
    <section className="panel stack build-progress" aria-live="polite" aria-labelledby="progress-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="progress-title">Reading spec sheets</h2>
        <span className="small muted tabular">
          {progress.categories.length ? `${done} of ${progress.categories.length} parts · ` : ""}
          {seconds} s
        </span>
      </div>
      {progress.categories.length === 0 ? (
        <p className="small muted">Working out what your setup needs…</p>
      ) : (
        <ol className="progress-steps">
          {progress.categories.map((c) => {
            const s = progress.byCategory[c];
            return (
              <li key={c} className={s.status}>
                <span className="progress-mark" aria-hidden="true">{MARK[s.status]}</span>
                <span className="progress-cat">{CATEGORY[c] ?? c}</span>
                <span className="progress-detail small">
                  {s.status === "waiting" && <span className="muted">Waiting</span>}
                  {s.status === "checking" && (
                    <span>
                      Checking <strong>{s.product}</strong>
                      {s.against?.length ? <span className="muted"> against {s.against.join(", ")}</span> : null}
                    </span>
                  )}
                  {s.status === "picked" && <strong>{s.product}</strong>}
                  {s.status === "none" && <span>No compatible part in the catalogue</span>}
                  {s.rejected.length > 0 && (
                    <span className="progress-rejected">Failed the check: {s.rejected.join(", ")}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
