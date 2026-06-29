/**
 * ProductionStatusControlCenter.tsx — Command UI skin for the Production Status page.
 *
 * Light-theme, command-kit layout that mirrors the RFI Control Center pattern.
 * Receives all data as props from the ProductionStatus.jsx shell (which retains
 * the React Query fetch, modal state, and import mutations). This component is
 * purely presentational — no network calls.
 *
 * Mounted behind the `command_ui` feature flag in ProductionStatus.jsx.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
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
import { buildProductionSummary, stageTone, PRODUCTION_STAGES } from "./productionStatusControlCenter.derive";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_FILTERS = ["All", ...PRODUCTION_STAGES] as const;

function fmtPct(n: number): string {
  return `${n}%`;
}

/** ISO date cell — mono, compact, highlights past-due pieces. */
function shipDateCell(p: PieceProductionRow) {
  if (!p.ship_date) return <span style={{ color: "var(--cmd-meta)" }}>—</span>;
  const today = new Date().toISOString().slice(0, 10);
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

  // DataTable columns — mapped directly to real PieceProductionRow fields
  const columns: Column<PieceProductionRow>[] = [
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
      align: "right",
      render: (p) => (
        <span className="cmd-row__num">
          {p.percent_complete != null ? `${p.percent_complete}%` : "—"}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (p) => <span className="cmd-row__num">{p.quantity ?? "—"}</span>,
    },
    {
      key: "ship_date",
      header: "Ship Date",
      render: shipDateCell,
    },
  ];

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

      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage={
          pieces.length === 0
            ? "No production data yet — import a CSV from Tekla EPM or FabSuite."
            : "No pieces match your filters."
        }
      />
    </div>
  );
}
