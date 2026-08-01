/**
 * ProductionStatusControlCenter.tsx — canonical Production Status presentation.
 *
 * Light-theme, command-kit layout that mirrors the RFI Control Center pattern.
 * Receives all data as props from the ProductionStatus.jsx shell (which retains
 * the React Query fetch, modal state, and import mutations). This component is
 * the canonical presentation and is purely presentational — no network calls.
 *
 * Large filtered lists (>100 rows) use the repo's useVirtualizer house pattern
 * (sticky CSS-grid header + absolute rows) so 5k–20k piece registers stay
 * scrollable without mounting every row into the DOM.
 */
import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Factory, CheckCircle2, AlertTriangle, Clock, TrendingUp, Layers, Boxes } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import type { PieceProductionRow } from "@/lib/production/repository";
import type { PieceDrawingLink } from "@/lib/production/pieceDrawingLinks";
import { normalizePieceMark } from "@/services/modelElementStatus";
import {
  buildProductionSummary,
  stageTone,
  PRODUCTION_STAGES,
  localTodayISO,
  shouldVirtualizeProductionRows,
} from "./productionStatusControlCenter.derive";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_FILTERS = ["All", ...PRODUCTION_STAGES] as const;

/** CSS-grid template shared by virtualized header + rows (9 columns). */
const GRID_COLS =
  "minmax(100px, 1.2fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(56px, 0.6fr) minmax(72px, 0.9fr) minmax(88px, 0.9fr) minmax(72px, 0.7fr) minmax(48px, 0.5fr) minmax(96px, 0.9fr)";

function fmtPct(n: number): string {
  return `${n}%`;
}

/** ISO date cell — mono, compact, highlights past-due pieces. `today` is hoisted. */
function shipDateCell(p: PieceProductionRow, today: string) {
  if (!p.ship_date) return <span style={{ color: "var(--cmd-meta)" }}>—</span>;
  const overdue = p.status !== "Shipped" && p.ship_date < today;
  return (
    <span style={overdue ? { color: "var(--cmd-danger)", fontWeight: 600 } : { fontFamily: "var(--font-mono)", fontSize: 11 }}>
      {p.ship_date}
      {overdue ? " · late" : ""}
    </span>
  );
}

/** Stage pill using command-kit tones. */
function stagePill(stage: string | null | undefined) {
  if (!stage) return <span style={{ color: "var(--cmd-meta)" }}>—</span>;
  return <Pill tone={stageTone(stage)}>{stage}</Pill>;
}

/**
 * Shop-drawing cell. A drawing_id → a real DrawingViewer link; a drawing_no with
 * no id → plain info text (shop/detail numbers don't reliably match erection
 * sheets, so we never fabricate a link); nothing → em-dash.
 */
function shopDrawingCell(link: PieceDrawingLink | undefined) {
  if (link?.drawingId) {
    return (
      <Link
        to={`/DrawingViewer?id=${encodeURIComponent(link.drawingId)}`}
        style={{ color: "var(--cmd-accent, var(--accent))", fontFamily: "var(--font-mono)", fontSize: 11 }}
      >
        {link.drawingNo || "View sheet"}
      </Link>
    );
  }
  if (link?.drawingNo) {
    return <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{link.drawingNo}</span>;
  }
  return <span style={{ color: "var(--cmd-meta)" }}>—</span>;
}

/** Scroll the data table into view. */
function scrollToTable() {
  document.querySelector(".prod-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Shared cell content for both <table> and virtualized grid branches. */
function pieceRowCells(
  p: PieceProductionRow,
  pieceDrawingMap: Map<string, PieceDrawingLink> | undefined,
  today: string,
): ReactNode[] {
  return [
    <span key="mark" className="cmd-row__num">{p.piece_mark}</span>,
    p.assembly_mark || <span key="asm" style={{ color: "var(--cmd-meta)" }}>—</span>,
    <span key="dwg">{shopDrawingCell(pieceDrawingMap?.get(normalizePieceMark(p.piece_mark)))}</span>,
    p.sequence_number || <span key="seq" style={{ color: "var(--cmd-meta)" }}>—</span>,
    p.erection_area || <span key="area" style={{ color: "var(--cmd-meta)" }}>—</span>,
    <span key="stage">{stagePill(p.status)}</span>,
    <span key="pct" className="cmd-row__num">
      {p.percent_complete != null ? `${p.percent_complete}%` : "—"}
    </span>,
    <span key="qty" className="cmd-row__num">{p.quantity ?? "—"}</span>,
    <span key="ship">{shipDateCell(p, today)}</span>,
  ];
}

const COLUMN_META: { key: string; header: string; align?: "left" | "right" }[] = [
  { key: "piece_mark", header: "Piece Mark" },
  { key: "assembly_mark", header: "Assembly" },
  { key: "shop_dwg", header: "Shop Dwg" },
  { key: "sequence_number", header: "Seq" },
  { key: "erection_area", header: "Area" },
  { key: "status", header: "Stage" },
  { key: "percent_complete", header: "% Complete", align: "right" },
  { key: "quantity", header: "Qty", align: "right" },
  { key: "ship_date", header: "Ship Date" },
];

// ── Virtualized branch (>100 rows) ──────────────────────────────────────────

function VirtualPieceTable({
  rows,
  pieceDrawingMap,
  today,
}: {
  rows: PieceProductionRow[];
  pieceDrawingMap?: Map<string, PieceDrawingLink>;
  today: string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    overscan: 12,
  });

  return (
    <div className="cmd-table-wrap" style={{ overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          borderBottom: "1px solid var(--cmd-border)",
        }}
      >
        {COLUMN_META.map((c) => (
          <div
            key={c.key}
            style={{
              padding: "10px 14px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--cmd-text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: c.align === "right" ? "flex-end" : "flex-start",
              minWidth: 0,
              whiteSpace: "nowrap",
            }}
          >
            {c.header}
          </div>
        ))}
      </div>
      <div ref={parentRef} style={{ maxHeight: 600, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const p = rows[virtualRow.index];
            const cells = pieceRowCells(p, pieceDrawingMap, today);
            return (
              <div
                key={p.id || virtualRow.index}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  borderTop: virtualRow.index === 0 ? "none" : "1px solid var(--cmd-border)",
                }}
              >
                {cells.map((cell, i) => (
                  <div
                    key={COLUMN_META[i].key}
                    style={{
                      padding: "11px 14px",
                      fontSize: 13,
                      color: "var(--cmd-text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: COLUMN_META[i].align === "right" ? "flex-end" : "flex-start",
                      minWidth: 0,
                    }}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Drawing-link coverage over the displayed pieces. */
export interface DrawingCoverage {
  total: number;
  linked: number;
  pct: number;
}

export interface ProductionStatusControlCenterProps {
  projectName: string;
  pieces: PieceProductionRow[];
  filtered: PieceProductionRow[];
  search: string;
  onSearch: (v: string) => void;
  stageFilter: string;
  onStageFilterChange: (v: string) => void;
  onExport: () => void;
  onImport: (() => void) | null;
  onImportEpm?: (() => void) | null;
  /** Normalized piece mark → drawing reference (from buildPieceDrawingMap). */
  pieceDrawingMap?: Map<string, PieceDrawingLink>;
  /** Share of displayed pieces whose mark resolves to a model-roster entry. */
  drawingCoverage?: DrawingCoverage;
  projectHealth?: string | null;
  percentComplete?: number | null;
  photoSrc?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductionStatusControlCenter(props: ProductionStatusControlCenterProps) {
  const {
    projectName,
    pieces,
    filtered,
    search,
    onSearch,
    stageFilter,
    onStageFilterChange,
    onExport,
    onImport,
    onImportEpm,
    pieceDrawingMap,
    drawingCoverage,
    projectHealth,
    percentComplete,
    photoSrc,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildProductionSummary(pieces), [pieces]);
  // One local calendar day for every ship-date cell this render (not per-row).
  const today = useMemo(() => localTodayISO(), []);
  const virtualize = shouldVirtualizeProductionRows(filtered.length);

  // Hero chips: quick-glance totals
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.completed} Shipped`, tone: "good" as const },
    { label: `${s.pastDue} Past Due`, tone: "danger" as const },
  ];

  // Hero stat cards (project-level context, real fields when available)
  const heroStats = [
    { value: projectHealth || "—", label: "Project Health" },
    {
      value: percentComplete != null ? `${Math.round(percentComplete)}%` : `${s.pctComplete}%`,
      label: "Fab Complete",
    },
  ];

  // KPI strip — 6 cells, all from real fields. qualityHold = MISSING (always 0).
  const kpiCells: KpiCellDef[] = [
    {
      label: "In Production",
      value: s.inProduction,
      sublabel: "pieces",
      tone: s.inProduction > 0 ? "warn" : "neutral",
      Icon: Layers,
    },
    {
      label: "Shipped",
      value: s.completed,
      sublabel: "pieces",
      tone: s.completed > 0 ? "good" : "neutral",
      Icon: CheckCircle2,
    },
    {
      label: "Past Due",
      value: s.pastDue,
      sublabel: "ship date",
      tone: s.pastDue > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Not Started",
      value: s.notStarted,
      sublabel: "pieces",
      tone: s.notStarted > 0 ? "info" : "neutral",
      Icon: Clock,
    },
    {
      label: "Avg Complete",
      value: fmtPct(s.pctComplete),
      sublabel: "all pieces",
      tone: "info",
      Icon: TrendingUp,
    },
    {
      label: "Total Pieces",
      value: s.total,
      sublabel: "tracked",
      tone: "neutral",
      Icon: Boxes,
    },
  ];

  // DataTable columns — mapped directly to real PieceProductionRow fields.
  // Keep per-column renders cheap (no recompute-all-cells-per-column). The
  // virtualized branch uses pieceRowCells so column order stays in sync via
  // COLUMN_META.
  const columns: Column<PieceProductionRow>[] = useMemo(
    () => [
      {
        key: "piece_mark",
        header: "Piece Mark",
        render: (p) => <span className="cmd-row__num">{p.piece_mark}</span>,
      },
      {
        key: "assembly_mark",
        header: "Assembly",
        render: (p) => p.assembly_mark || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
      },
      {
        key: "shop_dwg",
        header: "Shop Dwg",
        render: (p) => shopDrawingCell(pieceDrawingMap?.get(normalizePieceMark(p.piece_mark))),
      },
      {
        key: "sequence_number",
        header: "Seq",
        render: (p) => p.sequence_number || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
      },
      {
        key: "erection_area",
        header: "Area",
        render: (p) => p.erection_area || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
      },
      {
        key: "status",
        header: "Stage",
        render: (p) => stagePill(p.status),
      },
      {
        key: "percent_complete",
        header: "% Complete",
        align: "right" as const,
        render: (p) => (
          <span className="cmd-row__num">
            {p.percent_complete != null ? `${p.percent_complete}%` : "—"}
          </span>
        ),
      },
      {
        key: "quantity",
        header: "Qty",
        align: "right" as const,
        render: (p) => <span className="cmd-row__num">{p.quantity ?? "—"}</span>,
      },
      {
        key: "ship_date",
        header: "Ship Date",
        render: (p) => shipDateCell(p, today),
      },
    ],
    [pieceDrawingMap, today],
  );

  const emptyMessage =
    pieces.length === 0
      ? "No production data yet — import a CSV from Tekla EPM or FabSuite."
      : "No pieces match your filters.";

  return (
    <div className="prod-cc">
      <PageHero
        Icon={Factory}
        title="Production Status Control Center"
        subtitle="Per-piece fabrication status from Tekla EPM / FabSuite — tracks what's ready to ship and erect."
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoSrc}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: By Erection Area */}
        <DecisionPanel title="By Erection Area" onViewAll={scrollToTable}>
          {s.byArea.length === 0 ? (
            <div className="cmd-row__meta">No erection-area data imported yet.</div>
          ) : (
            s.byArea.map((a) => (
              <div className="cmd-row" key={a.area}>
                <div>
                  <div className="cmd-row__num">{a.area}</div>
                  <div className="cmd-row__meta">{a.total} pieces · {a.shipped} shipped</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={a.avgPct >= 85 ? "good" : a.avgPct >= 40 ? "warn" : "neutral"}>
                    {a.avgPct}%
                  </Pill>
                  <span className="cmd-row__meta">{a.inFab} active</span>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2: By Stage / Status */}
        <DecisionPanel title="By Stage" onViewAll={scrollToTable}>
          {s.stageQueue.length === 0 ? (
            <div className="cmd-row__meta">No active pieces in production.</div>
          ) : (
            s.stageQueue.map((row) => (
              <div className="cmd-row" key={row.stage}>
                <div>
                  <div className="cmd-row__num">{row.stage}</div>
                  <div className="cmd-row__meta">{row.count} pieces · {row.pct}% of total</div>
                </div>
                <Pill tone={stageTone(row.stage)}>{row.count}</Pill>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3: Past-Due / Quality Hold queue */}
        <DecisionPanel title="Past Due" onViewAll={scrollToTable}>
          {s.pastDueQueue.length === 0 ? (
            <div className="cmd-row__meta">No pieces past their ship date.</div>
          ) : (
            s.pastDueQueue.map((p) => (
              <div className="cmd-row" key={p.id}>
                <div>
                  <div className="cmd-row__num">{p.piece_mark}</div>
                  <div className="cmd-row__meta">
                    {p.erection_area || "No area"} · Ship: {p.ship_date}
                  </div>
                </div>
                <Pill tone="danger">{p.status || "—"}</Pill>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search piece mark, assembly, area, or sequence"
        onImport={onImport}
        onExport={onExport}
        filters={
          <>
            {STAGE_FILTERS.map((stage) => (
              <button
                key={stage}
                type="button"
                className={`cmd-chip-btn${stageFilter === stage ? " is-active" : ""}`}
                onClick={() => onStageFilterChange(stage)}
              >
                {stage}
              </button>
            ))}
            {onImportEpm ? (
              <button
                type="button"
                className="cmd-chip-btn"
                onClick={onImportEpm}
                title="Import Tekla EPM File"
                style={{ marginLeft: 8 }}
              >
                <Boxes size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Tekla EPM
              </button>
            ) : null}
          </>
        }
      />

      {drawingCoverage && drawingCoverage.total > 0 ? (
        <div
          className="cmd-row__meta"
          style={{ display: "flex", justifyContent: "flex-end", padding: "4px 2px" }}
          title="Share of shown pieces whose mark resolves to a shop drawing in the model roster. Shop/detail numbers rarely match erection sheets, so most pieces have no sheet link yet."
        >
          Drawing coverage <strong style={{ margin: "0 4px" }}>{drawingCoverage.pct}%</strong>
          ({drawingCoverage.linked}/{drawingCoverage.total} linked)
        </div>
      ) : null}

      {virtualize ? (
        <VirtualPieceTable rows={filtered} pieceDrawingMap={pieceDrawingMap} today={today} />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
}
