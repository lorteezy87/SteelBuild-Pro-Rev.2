import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Lock, Search } from "lucide-react";
import { SectionCard, StatusPill } from "@/components/desktop/module";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { effectiveDetailingState } from "@/lib/detailingPackageState";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import {
  accent,
  border,
  currentRevisionForPackage,
  dueInfoFor,
  getSubmittalDueDate,
  isClosedPackage,
  mono,
  success,
  surface1,
  textMuted,
  textPrimary,
} from "./format";
import type { CurrentRevisionInfo } from "./types";
import {
  DueChip,
  GridCell,
  GridHeaderCell,
  HealthChip,
  ModalLoadingFallback,
  OperationalStateChip,
  Td,
  Th,
} from "./primitives";
import { HealthBreakdownDialog } from "./fleetHealthStrip";

// These shared screens are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
// Lazy so the heavy revision/PDF modals only load when a row action fires —
// they never weigh down the hub chunk on tab open. The upload modals use
// lazyWithRetry so a stale-chunk 404 after a deploy triggers ONE reload for
// fresh assets instead of silently failing to open the modal.
const RevisionUploadModal = lazyWithRetry(() => import("@/components/drawings/RevisionUploadModal")) as unknown as ComponentType<AnyProps>;
const RevisionImpactReportModal = lazy(() => import("@/components/drawings/RevisionImpactReportModal")) as unknown as ComponentType<AnyProps>;
const DrawingSetUploadModal = lazyWithRetry(() => import("@/components/drawings/DrawingSetUploadModal")) as unknown as ComponentType<AnyProps>;
const DrawingLogImportModal = lazyWithRetry(() => import("@/components/drawings/DrawingLogImportModal")) as unknown as ComponentType<AnyProps>;
// Per-row action/state handlers shared by the table and virtualized branches of
// the Drawing Register. The cell content is identical in both; only the wrapping
// element differs (<td> in the table, grid <div> in the virtual list).
interface RegisterRowHandlers {
  rowBtn: CSSProperties;
  aiDiffEnabled: boolean;
  onOpenSummary?: (summary: any) => void;
  setHealthDetail: (h: any) => void;
  setRevisionSet: (pkg: any) => void;
  setReportSet: (pkg: any) => void;
}

// Shared CSS-grid column template for the virtualized Drawing Register (header +
// rows use this exact string, so they always align). Widths approximate the
// table's auto-layout: a wide set-name column, content columns, then the
// right-aligned numeric / action columns.
const REGISTER_GRID_COLS =
  "minmax(220px, 2.4fr) minmax(64px, 0.8fr) minmax(80px, 0.9fr) 64px minmax(120px, 1.1fr) minmax(96px, 1fr) minmax(80px, 0.8fr) minmax(96px, 1fr) 56px minmax(150px, 1fr)";

// ⚠ MIRROR of the table-branch <Td> cells in DrawingRegisterTable (the
// !shouldVirtualize branch). Any column add/edit MUST be made in BOTH places.
/**
 * RegisterGridCells — virtualized mirror of the inline table <Td> cells. Same
 * content and styling, rendered as grid <div> cells (in REGISTER_GRID_COLS
 * order) so the absolute-positioned virtual rows line up with the grid header.
 */
function RegisterGridCells({ r, h }: { r: any; h: RegisterRowHandlers }) {
  return (
    <>
      <GridCell style={{ color: textPrimary, fontWeight: 600 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pkg.name}</span>
          {r.locked && (
            <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
              <Lock size={9} /> Locked
            </span>
          )}
          {r.revSummary && (
            <button type="button" title="View the revision summary" onClick={(e) => { e.stopPropagation(); h.onOpenSummary?.(r.revSummary.summary); }}
              style={{ marginLeft: 8, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, cursor: "pointer", flexShrink: 0, background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", color: accent }}>
              revised · {r.revSummary.sheets_changed}
            </button>
          )}
        </span>
      </GridCell>
      <GridCell style={{ color: textMuted }}>{r.setNo}</GridCell>
      <GridCell style={{ color: textMuted }}>{r.discipline}</GridCell>
      <GridCell align="right">{r.sheetCount}</GridCell>
      <GridCell>{r.effectiveState && r.effectiveState !== "Not Started" ? <OperationalStateChip state={r.effectiveState} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>}</GridCell>
      <GridCell>{r.health ? <HealthChip health={r.health} onClick={() => h.setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>}</GridCell>
      <GridCell style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</GridCell>
      <GridCell><DueChip info={r.due} /></GridCell>
      <GridCell align="right" style={{ color: textMuted }}>{r.maxRev || "—"}</GridCell>
      <GridCell align="right" style={{ whiteSpace: "nowrap" }}>
        {r.pkg.parent && (
          <button
            type="button"
            disabled={r.locked}
            title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
            onClick={() => { if (!r.locked) h.setRevisionSet(r.pkg); }}
            style={{ ...h.rowBtn, opacity: r.locked ? 0.45 : 1, cursor: r.locked ? "not-allowed" : "pointer" }}
          >New Rev</button>
        )}
        {h.aiDiffEnabled && (
          <button type="button" title="AI Revision Impact Report" onClick={() => h.setReportSet(r.pkg)} style={{ ...h.rowBtn, marginLeft: 6, color: accent, borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>✦ Report</button>
        )}
      </GridCell>
    </>
  );
}

/**
 * RegisterVirtualList — virtualized rendering of the Drawing Register, used only
 * when row count exceeds VIRTUALIZE_THRESHOLD. Uses a sticky CSS-grid header and
 * absolute-positioned grid rows (the repo's useVirtualizer house pattern). The
 * left-border late/done accent and row keys are preserved from the table.
 */
function RegisterVirtualList({
  rows, sortByHealth, setSortByHealth, h,
}: {
  rows: any[];
  sortByHealth: null | "asc" | "desc";
  setSortByHealth: (fn: (s: null | "asc" | "desc") => null | "asc" | "desc") => void;
  h: RegisterRowHandlers;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 41,
    overscan: 12,
  });

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
      <div style={{
        display: "grid", gridTemplateColumns: REGISTER_GRID_COLS,
        borderBottom: `1px solid ${border}`, borderLeft: "3px solid transparent",
      }}>
        <GridHeaderCell>Drawing Set Package</GridHeaderCell>
        <GridHeaderCell>Set #</GridHeaderCell>
        <GridHeaderCell>Discipline</GridHeaderCell>
        <GridHeaderCell align="right">Sheets</GridHeaderCell>
        <GridHeaderCell>Status</GridHeaderCell>
        <GridHeaderCell>
          {/* Real <button> for keyboard operability (H16); sort direction is
              announced via the dynamic aria-label since the shared GridHeaderCell
              primitive doesn't forward an aria-sort attribute. */}
          <button
            type="button"
            onClick={() => setSortByHealth((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
            aria-label={`Sort by health score${sortByHealth === "asc" ? " (ascending)" : sortByHealth === "desc" ? " (descending)" : ""}`}
            title="Sort by health score"
            style={{ cursor: "pointer", userSelect: "none", background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
          >
            Health{sortByHealth === "asc" ? " ▲" : sortByHealth === "desc" ? " ▼" : ""}
          </button>
        </GridHeaderCell>
        <GridHeaderCell>Released</GridHeaderCell>
        <GridHeaderCell>Due</GridHeaderCell>
        <GridHeaderCell align="right">Rev</GridHeaderCell>
        <GridHeaderCell align="right">{""}</GridHeaderCell>
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
                  display: "grid", gridTemplateColumns: REGISTER_GRID_COLS,
                  borderTop: virtualRow.index === 0 ? "none" : `1px solid ${border}`,
                  borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent",
                }}
              >
                <RegisterGridCells r={r} h={h} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * DrawingRegisterTable — the Drawing Register as a clean, flat, per-set table,
 * mirroring the Approval/Submittal register look (same Th/Td/OperationalStateChip/DueChip
 * primitives) instead of the dense grouped DrawingsTable. One row per drawing
 * set. Left border: red = late, green = done (good to go), neutral = in progress.
 * Full sheet-level management still lives on the standalone Drawings page.
 */
export function DrawingRegisterTable({
  setPackages, projectId, activeProject, drawingSets = [], isLoading, healthByKey, currentRevByDrawingId, summariesBySet, onRevisionUploaded, onOpenSummary,
}: {
  setPackages: any[]; projectId?: string; activeProject?: any; drawingSets?: any[]; isLoading?: boolean;
  healthByKey?: Map<string, any>;
  /** Authoritative current revision per drawing (drawing_revisions.is_current) —
   *  drives the "Rev" column instead of the deprecated drawings.revision_number. */
  currentRevByDrawingId?: Map<string, CurrentRevisionInfo>;
  summariesBySet?: Map<string, any>;
  onRevisionUploaded?: (pkgKey: string) => void;
  onOpenSummary?: (summary: any) => void;
}) {
  const aiDiffEnabled = useFlag("revision_ai_diff");
  // Phase 5 display: the register's Due chip is driven by the governing
  // SUBMITTAL's required_date (getSubmittalDueDate below), so it counts in
  // working days (Mon–Fri) when the flag is on — matching the Control Board /
  // Approval Matrix. The per-sheet DRAWING dates are not shown here, so no
  // calendar-day carve-out is needed. Default off → calendar-day, unchanged.
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
    // under this key — without it the register served a stale revision after an
    // upload until a manual page reload.
    qc.invalidateQueries({ queryKey: ["drawing-register", projectId] });
  };

  const rowBtn: CSSProperties = {
    fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    padding: "3px 8px", borderRadius: 6, cursor: "pointer",
    background: "transparent", border: `1px solid ${border}`, color: textMuted,
  };

  const rows = useMemo(() => {
    return (setPackages || [])
      .map((pkg: any) => {
        const sheets: any[] = pkg.sheets || [];
        const submittals: any[] = pkg.submittals || [];
        const latestSubmittal = submittals.slice().sort((a, b) => (b.round_number || 1) - (a.round_number || 1))[0] || null;
        const sheetCount = sheets.length || (pkg.parent?.sheet_count ?? 0);
        // Per-sheet "released" count is DISPLAY ONLY (the n/total badge). It still
        // reads the legacy columns to show progress, but it MUST NOT decide the
        // package's released/done state — that is submittal-governed below.
        const releasedCount = sheets.filter((d) => d.stage === "Released" || d.set_approval_status === "approved").length;
        // §20-21: the package's released/done state is the submittal authority, via
        // the SAME predicate as the hub's "Sets Released" KPI (isClosedPackage), so
        // the Released column and the KPI never disagree. A stale legacy
        // set_approval_status="approved" on a sheet can no longer force "Released"
        // while a governing submittal is still mid-flow.
        const done = isClosedPackage(pkg);
        // Operational (coalesced) state drives the Status chip so it agrees with the
        // Released column — a mid-flow submittal can't render alongside a green
        // "Released", and a released package reads "Released" in both columns.
        const effectiveState = effectiveDetailingState(pkg.parent, submittals, sheets);
        const due = dueInfoFor(getSubmittalDueDate(latestSubmittal), { closed: done, useWorkdays: workdayDues });
        const discipline = pkg.parent?.discipline || [...new Set(sheets.map((d) => d.discipline).filter(Boolean))][0] || "—";
        // §20-21: the displayed Rev is a per-set rollup of the AUTHORITATIVE
        // current revision (drawing_revisions.is_current via currentRevByDrawingId)
        // — the code of the highest-version sheet — NOT the drift-prone, free-text
        // drawings.revision_number. currentRevisionForPackage already falls back
        // to the legacy number, then "—", when no sheet has a current revision.
        const maxRev = currentRevisionForPackage(sheets, currentRevByDrawingId || new Map());
        const stageCounts: Record<string, number> = {};
        for (const d of sheets) if (d.stage) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
        const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        return {
          pkg, due, sheetCount, releasedCount, discipline, maxRev, dominantStage,
          // `status` (raw latest-submittal status) is retained for the search
          // filter below ONLY — it does NOT drive the Status cell, which renders
          // from `effectiveState` (the coalesced operational state).
          status: latestSubmittal?.status || null, effectiveState, done, late: !!due.overdue && !done,
          health: healthByKey?.get(pkg.key) || null,
          locked: !!pkg.parent?.is_locked,
          lockedReason: pkg.parent?.locked_reason || null,
          revSummary: pkg.setId ? (summariesBySet?.get(String(pkg.setId)) || null) : null,
          setNo: pkg.parent ? formatDrawingSetNumber(pkg.parent) : "TBD",
        };
      })
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.pkg.name || "").toLowerCase().includes(q)
          || String(r.setNo).toLowerCase().includes(q)
          || (r.discipline || "").toLowerCase().includes(q)
          || (r.status || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortByHealth) {
          const sa = a.health?.score ?? 101;
          const sb = b.health?.score ?? 101;
          return sortByHealth === "asc" ? sa - sb : sb - sa;
        }
        return compareDrawingSetPackages(a.pkg.parent || a.pkg, b.pkg.parent || b.pkg);
      });
  }, [setPackages, search, healthByKey, sortByHealth, summariesBySet, currentRevByDrawingId, workdayDues]);

  // Above this many rows, render the virtualized grid instead of a full <table>
  // so large projects (1000+ sets) stay fast. Small projects keep the exact
  // table rendering below — unchanged.
  const VIRTUALIZE_THRESHOLD = 100;
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const rowHandlers: RegisterRowHandlers = {
    rowBtn, aiDiffEnabled, onOpenSummary, setHealthDetail, setRevisionSet, setReportSet,
  };

  if (isLoading) return <LoadingSkeleton />;

  return (
    <SectionCard
      title="Drawing register"
      headerAction={
        <button type="button" className="sbd-btn" title="Full Drawings editor — filters, bulk actions, rename / delete, per-sheet" onClick={() => navigate("/Drawings")}>Open full editor ↗</button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 440px", minWidth: 200 }}>
          <Search size={14} color={textMuted} style={{ position: "absolute", left: 10, top: 9 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drawing sets…"
            style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, border: `1px solid ${border}`, background: surface1, color: textPrimary, fontFamily: mono, fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button type="button" className="sbd-btn sbd-btn-primary cmd-btn cmd-btn--primary" onClick={() => setUploadOpen(true)}>+ Upload Drawings</button>
        )}
        {canEdit && (
          <button type="button" className="sbd-btn" onClick={() => setLogImportOpen(true)}>Import Log</button>
        )}
      </div>

      {shouldVirtualize ? (
        // ≥100 rows: virtualized grid. desk-table is intentionally NOT applied here —
        // RegisterVirtualList uses its own CSS grid layout (not a <table> element)
        // and the divergence is deliberate so the plain-table codepath can adopt
        // kit table styling without breaking the virtual renderer's grid geometry.
        <RegisterVirtualList rows={rows} sortByHealth={sortByHealth} setSortByHealth={setSortByHealth} h={rowHandlers} />
      ) : (
      <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
        {/* desk-table: kit table class — plain-table codepath only (see note on RegisterVirtualList above). */}
        <table className="desk-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Drawing Set Package</Th>
              <Th>Set #</Th>
              <Th>Discipline</Th>
              <Th style={{ textAlign: "right" }}>Sheets</Th>
              <Th>Status</Th>
              <Th>
                {/* Sort control is a real <button> for keyboard operability (H16).
                    aria-sort belongs on the column header, but the shared <Th>
                    primitive doesn't forward arbitrary attrs, so the current sort
                    direction is announced via the button's dynamic aria-label
                    instead. */}
                <button
                  type="button"
                  onClick={() => setSortByHealth((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
                  aria-label={`Sort by health score${sortByHealth === "asc" ? " (ascending)" : sortByHealth === "desc" ? " (descending)" : ""}`}
                  title="Sort by health score"
                  style={{ cursor: "pointer", userSelect: "none", background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
                >
                  Health{sortByHealth === "asc" ? " ▲" : sortByHealth === "desc" ? " ▼" : ""}
                </button>
              </Th>
              <Th>Released</Th>
              <Th>Due</Th>
              <Th style={{ textAlign: "right" }}>Rev</Th>
              <Th style={{ textAlign: "right" }}>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={10} style={{ textAlign: "center", color: textMuted, padding: 28 }}>
                  No drawing sets {search ? "match your search" : "yet"}.
                </Td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.pkg.key} style={{
                borderTop: `1px solid ${border}`,
                borderLeft: r.late ? "3px solid var(--status-error)" : r.done ? "3px solid var(--status-success)" : "3px solid transparent",
              }}>
                {/* ⚠ MIRROR of RegisterGridCells (virtualized branch) — edit both when changing columns. */}
                <Td style={{ color: textPrimary, fontWeight: 600 }}>
                  {r.pkg.name}
                  {r.locked && (
                    <span title={r.lockedReason || "Locked — released for fabrication"} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "middle" }}>
                      <Lock size={9} /> Locked
                    </span>
                  )}
                  {r.revSummary && (
                    <button type="button" title="View the revision summary" onClick={(e) => { e.stopPropagation(); onOpenSummary?.(r.revSummary.summary); }}
                      style={{ marginLeft: 8, fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, cursor: "pointer", verticalAlign: "middle", background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)", color: accent }}>
                      revised · {r.revSummary.sheets_changed}
                    </button>
                  )}
                </Td>
                <Td style={{ color: textMuted }}>{r.setNo}</Td>
                <Td style={{ color: textMuted }}>{r.discipline}</Td>
                <Td className="is-num" style={{ textAlign: "right" }}>{r.sheetCount}</Td>
                <Td>{r.effectiveState && r.effectiveState !== "Not Started"
                  // C3: render the operational state via kit StatusPill — tone mapped from
                  // the coalesced state string. OperationalStateChip is still used elsewhere
                  // in this file (triage lists, next-decision panel); only the register
                  // Status cell is swapped here.
                  ? <StatusPill tone={
                      /Released for Fabrication|Approved|Partially Released|Released for Erection/i.test(r.effectiveState) ? "done"
                      : /Internal Review|OFA|BFA|OFS|IFC/i.test(r.effectiveState) ? "review"
                      : /R&R|Revise/i.test(r.effectiveState) ? "danger"
                      : /IFA|In Detailing|Ready to Submit/i.test(r.effectiveState) ? "open"
                      : "neutral"
                    }>{r.effectiveState}</StatusPill>
                  : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{r.dominantStage || "No submittal"}</span>
                }</Td>
                <Td>{r.health ? <HealthChip health={r.health} onClick={() => setHealthDetail(r.health)} /> : <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>—</span>}</Td>
                <Td className="is-num" style={{ color: r.done ? success : textMuted }}>{r.releasedCount}/{r.sheetCount}</Td>
                <Td><DueChip info={r.due} /></Td>
                <Td className="is-num" style={{ textAlign: "right", color: textMuted }}>{r.maxRev || "—"}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.pkg.parent && (
                    <button
                      type="button"
                      disabled={r.locked}
                      title={r.locked ? `Locked — ${r.lockedReason || "an admin must unlock before a new revision"}` : "Upload a new revision for this set"}
                      onClick={() => { if (!r.locked) setRevisionSet(r.pkg); }}
                      style={{ ...rowBtn, opacity: r.locked ? 0.45 : 1, cursor: r.locked ? "not-allowed" : "pointer" }}
                    >New Rev</button>
                  )}
                  {aiDiffEnabled && (
                    <button type="button" title="AI Revision Impact Report" onClick={() => setReportSet(r.pkg)} style={{ ...rowBtn, marginLeft: 6, color: accent, borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>✦ Report</button>
                  )}
                </Td>
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
    </SectionCard>
  );
}
