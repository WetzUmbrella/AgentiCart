"use client";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClassRules } from "ag-grid-community";
import { useMemo } from "react";
import { usd } from "@/lib/client";
import { STATE_LABEL, type RowState } from "@/lib/labels";

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
  quote?: string;
  state: RowState;
  payment_note?: string;
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
  "row-captured": (p) => p.data?.state === "CAPTURED",
  "row-failed": (p) => p.data?.state === "CAPTURE_FAILED",
  "row-grey": (p) => p.data?.state === "NOT_CHARGED" || p.data?.state === "VOIDED",
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

function CheckCell(p: CustomCellRendererProps<GridRow>) {
  if (!p.data || p.data.pinned) return null;
  const { compatible, reason, quote } = p.data;
  const label = compatible === false ? "Doesn't fit." : compatible === true ? "Fits." : "";
  return (
    <span>
      {label && (
        <strong style={{ color: compatible === false ? "var(--rejected)" : "var(--charged)" }}>{label} </strong>
      )}
      {reason}
      {quote && <span className="quote">Spec sheet: &ldquo;{quote}&rdquo;</span>}
    </span>
  );
}

function StateCell(p: CustomCellRendererProps<GridRow>) {
  if (!p.data || p.data.pinned) return null;
  return (
    <span>
      <span className={`state ${p.data.state}`}>{STATE_LABEL[p.data.state]}</span>
      {p.data.payment_note && <span className="quote" style={{ fontStyle: "normal" }}>{p.data.payment_note}</span>}
      {p.data.tracking && <span className="quote" style={{ fontStyle: "normal" }}>Tracking {p.data.tracking}</span>}
    </span>
  );
}

function SwapCell(p: CustomCellRendererProps<GridRow>) {
  const ctx = p.context as { onSwap: (row: GridRow) => void; canSwap: boolean };
  if (!p.data || p.data.pinned || !ctx.canSwap || !p.data.line_id) return null;
  return (
    <button className="secondary" style={{ padding: "4px 10px" }} onClick={() => ctx.onSwap(p.data!)}>
      Swap
    </button>
  );
}

export default function BundleGrid({
  rows,
  onSwap,
  canSwap,
}: {
  rows: GridRow[];
  onSwap: (row: GridRow) => void;
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
      { headerName: "", colId: "swap", width: 84, cellRenderer: SwapCell },
    ],
    [],
  );

  const bundleRows = rows.filter((r) => r.state !== "REJECTED");
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
        context={{ onSwap, canSwap }}
        domLayout="autoHeight"
        defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
        suppressCellFocus
        suppressColumnVirtualisation
      />
      </div>
    </div>
  );
}
