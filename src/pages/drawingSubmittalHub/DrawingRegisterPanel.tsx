/**
 * DrawingRegisterPanel — the on-skin Drawing Register (drawings tab), Slice 2a of
 * the native command_ui conversion.
 *
 * Presentation-only. Renders INSIDE the shipped DetailingCommandShell light
 * island (whole-<html> [data-skin="command"]). The register's data, queries,
 * mutations, and the `["drawing-register", projectId]` cache-key invalidation are
 * UNCHANGED — this panel reuses the exact same row model (drawingRegister.derive),
 * the same cell content, the same row actions, and the same modals as the legacy
 * DrawingRegisterTable; only the chrome is swapped to the kit (FilterBar + kit
 * table / a re-skinned virtual grid).
 *
 * Virtualization is preserved: <100 rows render the kit `cmd-table`; ≥100 rows
 * render a virtualized CSS-grid (large-project perf, same threshold as legacy).
 * Both paths share ONE `columns` definition, so there is no "edit both places"
 * mirror hazard the legacy file warned about.
 */
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { FilterBar } from "@/components/command";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { accent, border, mono, success, textMuted, textPrimary } from "./format";
import type { CurrentRevisionInfo } from "./types";
import { DueChip, HealthChip, ModalLoadingFallback } from "./primitives";
import { StatusPill } from "@/components/desktop/module";
import { HealthBreakdownDialog } from "./fleetHealthStrip";
import {
  buildDrawingRegisterRows,
  filterDrawingRegisterRows,
  sortDrawingRegisterRows,
} from "./drawingRegister.derive";
import type { DrawingRegisterRow } from "./drawingRegister.derive";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
// Same lazy modals as the legacy register — upload modals use lazyWithRetry so a
// stale-chunk 404 after a deploy triggers ONE reload instead of silently failing.
const RevisionUploadModal = lazyWithRetry(() => import("@/components/drawings/RevisionUploadModal")) as unknown as ComponentType<AnyProps>;
const RevisionImpactReportModal = lazy(() => import("@/components/drawings/RevisionImpactReportModal")) as unknown as ComponentType<AnyProps>;
const DrawingSetUploadModal = lazyWithRetry(() => import("@/components/drawings/DrawingSetUploadModal")) as unknown as ComponentType<AnyProps>;
const DrawingLogImportModal = lazyWithRetry(() => import("@/components/drawings/DrawingLogImportModal")) as unknown as ComponentType<AnyProps>;

const VIRTUALIZE_THRESHOLD = 100;

/** Map the coalesced operational state string to a kit StatusPill tone — the same
 *  mapping the legacy register Status cell uses. */
function stateTone(state: string): string {
  if (/Released for Fabrication|Approved|Partially Released|Released for Erection/i.test(state)) return "done";
  if (/Internal Review|OFA|BFA|OFS|IFC/i.test(state)) return "review";
  if (/R&R|Revise/i.test(state)) return "danger";
  if (/IFA|In Detailing|Ready to Submit/i.test(state)) return "open";
  return "neutral";
}

interface RowActions {
  rowBtn: CSSProperties;
  aiDiffEnabled: boolean;
  onOpenSummary?: (summary: any) => void;
  setHealthDetail: (h: any) => void;
  setRevisionSet: (pkg: any) => void;
  setReportSet: (pkg: any) => void;
}

interface RegisterColumn {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** CSS-grid width track for the virtualized branch. */
  grid: string;
  render: (r: DrawingRegisterRow, a: RowActions) => ReactNode;
}

/** ONE column definition, shared by the kit table and the virtual grid. */
function buildColumns(sortByHealth: null | "asc" | "desc", toggleSort: () => void): RegisterColumn[] {
  const healthHeader = (
    <button
      type="button"
      onClick={toggleSort}
      aria-label={`Sort by health score${sortByHealth === "asc" ? " (ascending)" : sortByHealth === "desc" ? " (descending)" : ""}`}
      title="Sort by health score"
      style={{ cursor: "pointer", userSelect: "none", background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
    >
      Health{sortByHealth === "asc" ? " ▲" : sortByHealth === "desc" ? " ▼" : ""}
    </button>
  );
  return [
    {
      key: "name", header: "Drawing Set Package", grid: "minmax(220px, 2.4fr)",
      render: (r, a) => (
        <span style={{ display: "inline-flex", alignItems: "center", minWidth: 0, color: textPrimary, fontWeight: 600 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pkg.name}</span>
          {r.locked && (
            <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
              <Lock size={9} /> Locked
            </span>
          )}
          {r.revSummary && (
            <button type="button" title="View the revision summary" onClick={(e) => { e.stopPropagation(); a.onOpenSummary?.(r.revSummary.summary); }}
              style={{ marginLeft: 8, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, cursor: "pointer", flexShrink: 0, background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", color: accent }}>
              revised · {r.revSummary.sheets_changed}
            </button>
          )}
        </span>
      ),
    },
    { key: "setNo", header: "Set #", grid: "minmax(64px, 0.8fr)", render: (r) => <span style={{ color: textMuted }}>{r.setNo}</span> },
    { key: "discipline", header: "Discipline", grid: "minmax(80px, 0.9fr)", render: (r) => <span style={{ color: textMuted }}>{r.discipline}</span> },
    { key: "sheets", header: "Sheets", align: "right", grid: "64px", render: (r) => <>{r.sheetCount}</> },
    {
      key: "status", header: "Status", grid: "minmax(120px, 1.1fr)",
      render: (r) => (r.effectiveState && r.effectiveState !== "Not Started"
        ? <StatusPill tone={stateTone(r.effectiveState)}>{r.effectiveState}</StatusPill>
        : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>),
    },
    {
      key: "health", header: healthHeader, grid: "minmax(96px, 1fr)",
      render: (r, a) => (r.health ? <HealthChip health={r.health} onClick={() => a.setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>),
    },
    { key: "released", header: "Released", grid: "minmax(80px, 0.8fr)", render: (r) => <span style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</span> },
    { key: "due", header: "Due", grid: "minmax(96px, 1fr)", render: (r) => <DueChip info={r.due} /> },
    { key: "rev", header: "Rev", align: "right", grid: "56px", render: (r) => <span style={{ color: textMuted }}>{r.maxRev || "—"}</span> },
    {
      key: "actions", header: "", align: "right", grid: "minmax(150px, 1fr)",
      render: (r, a) => (
        <span style={{ whiteSpace: "nowrap" }}>
          {r.pkg.parent && (
            <button
              type="button"
              disabled={r.locked}
              title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
              onClick={(e) => { e.stopPropagation(); if (!r.locked) a.setRevisionSet(r.pkg); }}
              style={{ ...a.rowBtn, opacity: r.locked ? 0.45 : 1, cursor: r.locked ? "not-allowed" : "pointer" }}
            >New Rev</button>
          )}
          {a.aiDiffEnabled && (
            <button type="button" title="AI Revision Impact Report" onClick={(e) => { e.stopPropagation(); a.setReportSet(r.pkg); }} style={{ ...a.rowBtn, marginLeft: 6, color: accent, borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>✦ Report</button>
          )}
        </span>
      ),
    },
  ];
}

/** Virtualized branch — ≥100 rows. Sticky CSS-grid header + absolute grid rows,
 *  the repo's useVirtualizer house pattern; left-border late/done accent kept. */
function RegisterVirtualList({ rows, columns, actions }: { rows: DrawingRegisterRow[]; columns: RegisterColumn[]; actions: RowActions }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gridCols = columns.map((c) => c.grid).join(" ");
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 41,
    overscan: 12,
  });
  return (
    <div className="cmd-table-wrap" style={{ overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `1px solid var(--cmd-border, ${border})`, borderLeft: "3px solid transparent" }}>
        {columns.map((c) => (
          <div key={c.key} style={{ padding: "10px 14px", color: "var(--cmd-text-muted)", fontWeight: 600, fontSize: 12, textAlign: c.align || "left", whiteSpace: "nowrap" }}>{c.header}</div>
        ))}
      </div>
      <div ref={parentRef} style={{ maxHeight: 600, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            return (
              <div
                key={r.pkg.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute", top: 0, left: 0, width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid", gridTemplateColumns: gridCols,
                  borderTop: virtualRow.index === 0 ? "none" : `1px solid var(--cmd-border, ${border})`,
                  borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent",
                }}
              >
                {columns.map((c) => (
                  <div key={c.key} style={{ padding: "11px 14px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: c.align === "right" ? "flex-end" : "flex-start", minWidth: 0, color: "var(--cmd-text)" }}>
                    {c.render(r, actions)}
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

export interface DrawingRegisterPanelProps {
  setPackages: any[];
  projectId?: string;
  activeProject?: any;
  drawingSets?: any[];
  isLoading?: boolean;
  healthByKey?: Map<string, any>;
  currentRevByDrawingId?: Map<string, CurrentRevisionInfo>;
  summariesBySet?: Map<string, any>;
  onRevisionUploaded?: (pkgKey: string) => void;
  onOpenSummary?: (summary: any) => void;
}

export default function DrawingRegisterPanel({
  setPackages, projectId, activeProject, drawingSets = [], isLoading,
  healthByKey, currentRevByDrawingId, summariesBySet, onRevisionUploaded, onOpenSummary,
}: DrawingRegisterPanelProps) {
  const aiDiffEnabled = useFlag("revision_ai_diff");
  // Phase 5: register Due chip is submittal-governed → working-day-aware when the
  // flag is on. Default off → calendar-day, unchanged.
  const workdayDues = useFlag("submittal_workday_dues");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAppSecurity() as any;
  const canEdit = !can || can("edit", "drawing");
  const [search, setSearch] = useState("");
  const [revisionSet, setRevisionSet] = useState<any>(null);
  const [reportSet, setReportSet] = useState<any>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [logImportOpen, setLogImportOpen] = useState(false);
  const [healthDetail, setHealthDetail] = useState<any>(null);
  const [sortByHealth, setSortByHealth] = useState<null | "asc" | "desc">(null);

  const allSheets = useMemo(() => (setPackages || []).flatMap((p: any) => p.sheets || []), [setPackages]);
  const existingSetNames = useMemo(() => [...new Set((setPackages || []).map((p: any) => p.name).filter(Boolean))], [setPackages]);
  const refetchDrawings = () => {
    qc.invalidateQueries({ queryKey: ["drawings"] });
    qc.invalidateQueries({ queryKey: ["drawing-sets", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing-revisions", projectId] });
    // Doc Control register reads the current revision from drawing_register_view
    // under this key — keep it so the register never serves a stale revision.
    qc.invalidateQueries({ queryKey: ["drawing-register", projectId] });
  };

  const rowBtn: CSSProperties = {
    fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    padding: "3px 8px", borderRadius: 6, cursor: "pointer",
    background: "transparent", border: `1px solid var(--cmd-border, ${border})`, color: textMuted,
  };

  const rows = useMemo(() => {
    const built = buildDrawingRegisterRows({ setPackages, healthByKey, currentRevByDrawingId, summariesBySet, workdayDues });
    return sortDrawingRegisterRows(filterDrawingRegisterRows(built, search), sortByHealth);
  }, [setPackages, search, healthByKey, sortByHealth, summariesBySet, currentRevByDrawingId, workdayDues]);

  const toggleSort = () => setSortByHealth((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"));
  const columns = useMemo(() => buildColumns(sortByHealth, toggleSort), [sortByHealth]);
  const actions: RowActions = { rowBtn, aiDiffEnabled, onOpenSummary, setHealthDetail, setRevisionSet, setReportSet };
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search drawing sets…"
        onImport={canEdit ? () => setLogImportOpen(true) : null}
        primaryLabel={canEdit ? "Upload Drawings" : undefined}
        onPrimary={canEdit ? () => setUploadOpen(true) : null}
        secondaryActions={
          <button type="button" className="cmd-btn cmd-btn--ghost" title="Full Drawings editor — filters, bulk actions, rename / delete, per-sheet" onClick={() => navigate("/Drawings")}>
            Open full editor ↗
          </button>
        }
      />

      {shouldVirtualize ? (
        <RegisterVirtualList rows={rows} columns={columns} actions={actions} />
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="cmd-table__empty" colSpan={columns.length}>No drawing sets {search ? "match your search" : "yet"}.</td></tr>
              ) : rows.map((r) => (
                <tr
                  key={r.pkg.key}
                  style={{ borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent" }}
                >
                  {columns.map((c) => <td key={c.key} style={{ textAlign: c.align || "left" }}>{c.render(r, actions)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {healthDetail && <HealthBreakdownDialog health={healthDetail} onClose={() => setHealthDetail(null)} />}

      {revisionSet && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <RevisionUploadModal open onClose={() => setRevisionSet(null)} onComplete={() => { onRevisionUploaded?.(revisionSet?.key); setRevisionSet(null); }} activeProject={activeProject} preSelectedSet={revisionSet?.parent || revisionSet} drawingSets={drawingSets} />
        </Suspense>
      )}
      {reportSet && (
        <Suspense fallback={null}>
          <RevisionImpactReportModal open onClose={() => setReportSet(null)} set={reportSet} projectId={projectId} />
        </Suspense>
      )}
      {uploadOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <DrawingSetUploadModal open onClose={() => setUploadOpen(false)} onComplete={refetchDrawings} activeProject={activeProject} existingDrawings={allSheets} existingSetNames={existingSetNames} />
        </Suspense>
      )}
      {logImportOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <DrawingLogImportModal open projectId={projectId} projectName={activeProject?.name} onClose={() => setLogImportOpen(false)} onImported={refetchDrawings} />
        </Suspense>
      )}
    </div>
  );
}
