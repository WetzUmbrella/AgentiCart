"use client";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClassRules } from "ag-grid-community";
import { useMemo } from "react";
import { usd } from "@/lib/client";
import { STATE_LABEL, type RowState } from "@/lib/labels";
import type { Evidence, Trust } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

export type { RowState };

export type GridRow = {
  key: string;
  line_id?: string;
  product_id: string;
  category: string;
  name: string;
  merchant: string;
  qty: number;
  amount_cents: number;
  compatible: boolean | null;
  reason: string;
  evidence: Evidence[];
  trust?: Trust;
  state: RowState;
  payment_note?: string;
  /** What the AI read off the shipment's label photo; "" means unreadable. */
  label_text?: string;
  photo_url?: string;
  tracking?: string;
  pinned?: boolean;
};

const theme = themeQuartz.withParams({
  fontFamily: "var(--font)",
  fontSize: 15,
  accentColor: "#2f55d4",
  headerFontWeight: 700,
  borderColor: "#c9d1d8",
  rowBorder: true,
  wrapperBorderRadius: 12,
});

const rowClassRules: RowClassRules<GridRow> = {
  "row-rejected": (p) => p.data?.state === "REJECTED",
  "row-confirm": (p) => p.data?.state === "NEEDS_CONFIRM",
  "row-captured": (p) => p.data?.state === "CAPTURED",
  "row-failed": (p) => p.data?.state === "CAPTURE_FAILED",
  "row-grey": (p) => p.data?.state === "NOT_CHARGED" || p.data?.state === "VOIDED" || p.data?.state === "LEFT_OUT",
};

const cellText = { lineHeight: "1.4", paddingTop: "10px", paddingBottom: "14px", wordBreak: "normal" as const };

function PartCell(p: CustomCellRendererProps<GridRow>) {
  if (!p.data) return null;
  if (p.data.pinned) return <strong>{p.data.name}</strong>;
  return (
    <span>
      <strong>{p.data.name}</strong>
      <span className="quote" style={{ fontStyle: "normal" }}>{p.data.merchant}</span>
    </span>
  );
}

const TRUST_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;
const QUOTE_LABEL = { found: "Found in spec sheet", not_found: "Not found in spec sheet", unchecked: "Not auto-checked" } as const;
const SIGNAL_MARK = { good: "✓", bad: "✕", neutral: "–" } as const;

/** Each quote, whether the server found it in the sheet's text, and a link to the source. */
function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const quotes = evidence.filter((e) => e.quote);
  if (!quotes.length) return null;
  return (
    <ul className="evidence">
      {quotes.map((e, i) => {
        const check = e.quote_check ?? "unchecked";
        return (
          <li key={i}>
            <q>{e.quote}</q>
            <span className={`qcheck ${check}`}>
              {QUOTE_LABEL[check]}
              {e.source_url && (
                <>
                  {" · "}
                  <a href={e.source_url} target="_blank" rel="noreferrer">Source<span aria-hidden="true"> ↗</span></a>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The trust level, expandable to the checkable signals behind it. */
function TrustBadge({ trust }: { trust?: Trust }) {
  if (!trust || trust.level === "not_applicable") return null;
  return (
    <details className={`trust ${trust.level}`}>
      <summary>{TRUST_LABEL[trust.level]}</summary>
      <p>{trust.summary}</p>
      <ul>
        {trust.signals.map((sig) => (
          <li key={sig.key} className={sig.status}>
            <span aria-hidden="true">{SIGNAL_MARK[sig.status]}</span>
            <span><strong>{sig.label}:</strong> {sig.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CheckCell(p: CustomCellRendererProps<GridRow>) {
  if (!p.data || p.data.pinned) return null;
  const { compatible, reason, evidence, trust } = p.data;
  const label = compatible === false ? "Doesn't fit." : compatible === true ? "Fits." : "";
  return (
    <span>
      {label && (
        <strong style={{ color: compatible === false ? "var(--rejected)" : "var(--charged)" }}>{label} </strong>
      )}
      {reason}
      <EvidenceList evidence={evidence} />
      <TrustBadge trust={trust} />
    </span>
  );
}

function StateCell(p: CustomCellRendererProps<GridRow>) {
  if (!p.data || p.data.pinned) return null;
  return (
    <span>
      <span className={`state ${p.data.state}`}>{STATE_LABEL[p.data.state]}</span>
      {p.data.payment_note && <span className="quote" style={{ fontStyle: "normal" }}>{p.data.payment_note}</span>}
      {p.data.label_text !== undefined && (
        <span className="label-read">
          Label: {p.data.label_text ? <>&ldquo;{p.data.label_text}&rdquo;</> : "unreadable"}
          {p.data.photo_url && (
            <>
              {" · "}
              <a href={p.data.photo_url} target="_blank" rel="noreferrer">Photo<span aria-hidden="true"> ↗</span></a>
            </>
          )}
        </span>
      )}
      {p.data.tracking && <span className="quote" style={{ fontStyle: "normal" }}>Tracking {p.data.tracking}</span>}
    </span>
  );
}

type GridContext = { onSwap: (row: GridRow) => void; onConfirm: (lineId: string) => void; canSwap: boolean };

function ActionCell(p: CustomCellRendererProps<GridRow>) {
  const ctx = p.context as GridContext;
  if (!p.data || p.data.pinned || !ctx.canSwap || !p.data.line_id) return null;
  const row = p.data;
  return (
    <span className="cell-actions">
      {row.state === "NEEDS_CONFIRM" && (
        <button style={{ padding: "4px 10px" }} onClick={() => ctx.onConfirm(row.line_id!)}>
          Keep it
        </button>
      )}
      <button className="secondary" style={{ padding: "4px 10px" }} onClick={() => ctx.onSwap(row)}>
        Swap
      </button>
    </span>
  );
}

export default function BundleGrid({
  rows,
  onSwap,
  onConfirm,
  canSwap,
}: {
  rows: GridRow[];
  onSwap: (row: GridRow) => void;
  onConfirm: (lineId: string) => void;
  canSwap: boolean;
}) {
  const columnDefs = useMemo<ColDef<GridRow>[]>(
    () => [
      { field: "name", headerName: "Part", width: 168, wrapText: true, autoHeight: true, cellRenderer: PartCell, cellStyle: cellText },
      {
        field: "qty",
        headerName: "Qty",
        width: 64,
        valueFormatter: (p) => (p.data?.state === "REJECTED" ? "" : String(p.value)),
      },
      {
        field: "amount_cents",
        headerName: "Price",
        width: 104,
        valueFormatter: (p) => (p.data?.state === "REJECTED" || p.value == null ? "" : usd(p.value)),
        cellStyle: { fontVariantNumeric: "tabular-nums" },
      },
      { field: "reason", headerName: "Compatibility check", flex: 1, minWidth: 220, wrapText: true, autoHeight: true, cellRenderer: CheckCell, cellStyle: cellText },
      { field: "state", headerName: "Payment", width: 168, wrapText: true, autoHeight: true, cellRenderer: StateCell, cellStyle: cellText },
      { headerName: "", colId: "actions", width: 96, cellRenderer: ActionCell, cellStyle: cellText },
    ],
    [],
  );

  const bundleRows = rows.filter((r) => !["REJECTED", "NEEDS_CONFIRM", "LEFT_OUT"].includes(r.state));
  const pinned: GridRow[] = [
    {
      key: "total",
      product_id: "",
      category: "",
      name: "Bundle total",
      merchant: "",
      qty: bundleRows.reduce((s, r) => s + r.qty, 0),
      amount_cents: bundleRows.reduce((s, r) => s + r.amount_cents, 0),
      compatible: null,
      reason: "",
      evidence: [],
      state: "NOT_PAID",
      pinned: true,
    },
  ];

  return (
    // On narrow screens the table scrolls sideways inside this box instead of squashing rows.
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ minWidth: 820 }}>
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.key}
        rowClassRules={rowClassRules}
        pinnedBottomRowData={pinned}
        context={{ onSwap, onConfirm, canSwap } satisfies GridContext}
        domLayout="autoHeight"
        defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
        suppressCellFocus
        suppressColumnVirtualisation
      />
      </div>
    </div>
  );
}
