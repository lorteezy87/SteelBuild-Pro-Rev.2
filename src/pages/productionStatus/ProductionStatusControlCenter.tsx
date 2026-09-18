/**
 * ProductionStatusControlCenter.tsx — canonical Production Status presentation.
 *
 * Light-theme, command-kit layout that mirrors the RFI Control Center pattern.
 * Receives all data as props from the ProductionStatus.jsx shell (which retains
 * the React Query fetch, modal state, and import mutations). This component is
 * the canonical presentation and is purely presentational — no network calls.
 *
 * Large filtered lists virtualize via the shared command-kit DataTable
 * (useVirtualizer house pattern when rows > 100).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Boxes, Download, Upload } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import type { PieceProductionRow } from "@/lib/production/repository";
import type { PieceDrawingLink } from "@/lib/production/pieceDrawingLinks";
import { normalizePieceMark } from "@/services/modelElementStatus";
import type { ProductionStage } from "@/lib/importProductionStatus";
import {
  buildProductionSummary,
  stageTone,
  PRODUCTION_STAGES,
  localTodayISO,
} from "./productionStatusControlCenter.derive";
import ProductionStatusBulkBar from "./ProductionStatusBulkBar";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_FILTERS = ["All", ...PRODUCTION_STAGES] as const;

function fmtPct(n: number): string {
  return `${n}%`;
}

/** ISO date cell — mono, compact, highlights past-due pieces. */
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
  /** Selection (owned by shell). */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string, next: boolean) => void;
  onToggleAll?: (selectAll: boolean) => void;
  onClearSelection?: () => void;
  onBulkSetStage?: (stage: ProductionStage) => void;
  bulkPending?: boolean;
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
    selectedIds,
    onToggleRow,
    onToggleAll,
    onClearSelection,
    onBulkSetStage,
    bulkPending,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildProductionSummary(pieces), [pieces]);
  // Local calendar day once per render — not per row (UTC toISOString drifts near midnight).
  const today = localTodayISO();

  const attentionItems: AttentionItem[] = [
    ...s.pastDueQueue.map((piece) => ({
      id: `late-${piece.id}`,
      issue: `${piece.piece_mark} · ${piece.status || "Stage unknown"}`,
      deadline: piece.ship_date,
      risk: [
        "Past due ship date",
        piece.erection_area || null,
        piece.sequence_number ? `Seq ${piece.sequence_number}` : null,
      ].filter(Boolean).join(" · "),
      owner: null,
      nextAction: "Confirm shop status and recover ship date",
      tone: "danger" as const,
    })),
    ...s.missingShipDateQueue.map((piece) => ({
      id: `undated-${piece.id}`,
      issue: `${piece.piece_mark} · ${piece.status || "Stage unknown"}`,
      deadline: null,
      risk: [
        "Ship date unknown",
        piece.erection_area || null,
        piece.sequence_number ? `Seq ${piece.sequence_number}` : null,
      ].filter(Boolean).join(" · "),
      owner: null,
      nextAction: "Set planned ship date",
      tone: "warn" as const,
    })),
  ].slice(0, 12);

  const operationalMetrics = [
    {
      label: "In Production",
      value: s.inProduction,
      sublabel: "active shop pieces",
      tone: s.inProduction > 0 ? "info" as const : "neutral" as const,
    },
    {
      label: "Shipped",
      value: s.completed,
      sublabel: "pieces",
      tone: s.completed > 0 ? "good" as const : "neutral" as const,
    },
    {
      label: "Past Due",
      value: s.pastDue,
      sublabel: "ship date passed",
      tone: s.pastDue > 0 ? "danger" as const : "good" as const,
    },
    {
      label: "Missing Ship Date",
      value: s.missingShipDate,
      sublabel: "active shop pieces",
      tone: s.missingShipDate > 0 ? "warn" as const : "good" as const,
    },
    {
      label: "Not Started",
      value: s.notStarted,
      sublabel: "pieces",
      tone: "neutral" as const,
    },
    {
      label: "Avg Complete",
      value: fmtPct(s.pctComplete),
      sublabel: "recorded production",
      tone: "info" as const,
    },
    {
      label: "Drawing Coverage",
      value: drawingCoverage && drawingCoverage.total > 0 ? `${drawingCoverage.pct}%` : "Unknown",
      sublabel: drawingCoverage && drawingCoverage.total > 0
        ? `${drawingCoverage.linked}/${drawingCoverage.total} linked`
        : "model-roster evidence unavailable",
      tone: drawingCoverage && drawingCoverage.total > 0 && drawingCoverage.pct < 80
        ? "warn" as const
        : "neutral" as const,
    },
  ];

  // DataTable columns — grid tracks tune proportions when the virtualizer kicks in.
  const columns: Column<PieceProductionRow>[] = [
    {
      key: "piece_mark",
      header: "Piece Mark",
      grid: "minmax(100px, 1.2fr)",
      render: (p) => <span className="cmd-row__num">{p.piece_mark}</span>,
    },
    {
      key: "assembly_mark",
      header: "Assembly",
      grid: "minmax(80px, 1fr)",
      render: (p) => p.assembly_mark || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
    },
    {
      key: "shop_dwg",
      header: "Shop Dwg",
      grid: "minmax(80px, 1fr)",
      render: (p) => shopDrawingCell(pieceDrawingMap?.get(normalizePieceMark(p.piece_mark))),
    },
    {
      key: "sequence_number",
      header: "Seq",
      grid: "minmax(56px, 0.6fr)",
      render: (p) => p.sequence_number || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
    },
    {
      key: "erection_area",
      header: "Area",
      grid: "minmax(72px, 0.9fr)",
      render: (p) => p.erection_area || <span style={{ color: "var(--cmd-meta)" }}>—</span>,
    },
    {
      key: "status",
      header: "Stage",
      grid: "minmax(88px, 0.9fr)",
      render: (p) => stagePill(p.status),
    },
    {
      key: "percent_complete",
      header: "% Complete",
      align: "right",
      grid: "minmax(72px, 0.7fr)",
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
      grid: "minmax(48px, 0.5fr)",
      render: (p) => <span className="cmd-row__num">{p.quantity ?? "—"}</span>,
    },
    {
      key: "ship_date",
      header: "Ship Date",
      grid: "minmax(96px, 0.9fr)",
      render: (p) => shipDateCell(p, today),
    },
  ];

  const selectedCount = selectedIds?.size ?? 0;

  return (
    <div className="prod-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Production`}
        title="Production Status"
        subtitle="Piece-level shop execution, drawing linkage, ship-date risk, and next actions."
        meta={[
          projectHealth ? `Project health: ${projectHealth}` : "Project health: unknown",
          percentComplete != null ? `${Math.round(percentComplete)}% project complete` : `${s.pctComplete}% fab complete`,
          `${s.total} tracked pieces`,
        ].join(" · ")}
        actions={(
          <>
            {onImport ? (
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}>
                <Upload size={14} /> Import
              </button>
            ) : null}
            {onImportEpm ? (
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImportEpm}>
                <Boxes size={14} /> Tekla EPM
              </button>
            ) : null}
            <button type="button" className="cmd-btn cmd-btn--primary" onClick={onExport}>
              <Download size={14} /> Export
            </button>
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Production operational summary" />

      <AttentionQueue
        title="Production Attention"
        items={attentionItems}
        emptyMessage="No past-due or undated active production pieces."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>By Erection Area</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToTable}>View register</button>
          </div>
          <div>
            {s.byArea.length === 0 ? (
              <div className="sbp-attention__empty">No erection-area data imported yet.</div>
            ) : s.byArea.map((area) => (
              <div className="cmd-row" key={area.area}>
                <div>
                  <div className="cmd-row__num">{area.area}</div>
                  <div className="cmd-row__meta">{area.total} pieces · {area.shipped} shipped</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={area.avgPct >= 85 ? "good" : area.avgPct >= 40 ? "warn" : "neutral"}>
                    {area.avgPct}%
                  </Pill>
                  <span className="cmd-row__meta">{area.inFab} active</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Shop Stage Mix</h2>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={scrollToTable}>View register</button>
          </div>
          <div>
            {s.stageQueue.length === 0 ? (
              <div className="sbp-attention__empty">No active pieces in production.</div>
            ) : s.stageQueue.map((row) => (
              <div className="cmd-row" key={row.stage}>
                <div>
                  <div className="cmd-row__num">{row.stage}</div>
                  <div className="cmd-row__meta">{row.count} pieces · {row.pct}% of total</div>
                </div>
                <Pill tone={stageTone(row.stage)}>{row.count}</Pill>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search piece mark, assembly, area, or sequence"
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
          </>
        }
      />

      {selectedIds && onBulkSetStage && onClearSelection ? (
        <ProductionStatusBulkBar
          selectedCount={selectedCount}
          pending={bulkPending}
          onApplyStage={onBulkSetStage}
          onClear={onClearSelection}
        />
      ) : null}

      <DataTable
        columns={columns}
        rows={filtered}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        emptyMessage={
          pieces.length === 0
            ? "No production data yet — import a CSV from Tekla EPM or FabSuite."
            : "No pieces match your filters."
        }
      />
    </div>
  );
}
