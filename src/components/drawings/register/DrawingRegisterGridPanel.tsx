/**
 * DrawingRegisterGridPanel — the on-skin Doc Control "Register" view (Slice 2c).
 *
 * Sheet-level register (Doc Control clean table):
 *  - free-text + status + drawing-set filters
 *  - flat sheet rows by default; optional group-by-set
 *  - click sheet # / View to open DrawingViewer
 */
import {
  Suspense,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Star, Loader2, ChevronDown, ChevronRight, Eye, FileUp } from "lucide-react";
import { useDrawingRegister, type DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { usePublishRevision, type ReleaseStatus } from "@/hooks/usePublishRevision";
import { useMyDrawingWatches, useToggleDrawingWatch } from "@/hooks/useDrawingWatch";
import { usePermissions } from "@/services/permissions";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { ensureCurrentRevision } from "@/lib/drawingHub/revisions";
import { batchProcess } from "@/utils/batchProcess";
import { createPageUrl } from "@/utils";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { lazyWithRetry } from "@/lib/lazyRetry";
import type { SavedRevisionSummary } from "@/lib/revisionSummaryRepo";
import type { DrawingSet, SetPackage } from "@/pages/drawingSubmittalHub/types";
import { registerRowToDrawing, rowsNeedingProvisioning } from "./registerProvision";
import { TitleblockActionButton } from "./TitleblockActionButton";
import {
  buildRegisterDisplayRows,
  createDrawingRegisterIndex,
  filterIndexedRegisterRows,
  firstVisibleDrawingByPackage as deriveFirstVisibleDrawingByPackage,
  SET_FILTER_NONE,
  type IndexedRegisterRow,
  type RegisterDisplayRow,
} from "./docControl.derive";

interface RevisionUploadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  activeProject: { id?: string | null; name?: string | null } | null | undefined;
  preSelectedSet: DrawingSet;
  drawingSets: unknown[];
}

const RevisionUploadModal = lazyWithRetry(
  () => import("@/components/drawings/RevisionUploadModal"),
) as unknown as ComponentType<RevisionUploadModalProps>;

export interface DrawingRegisterGridPanelProps {
  projectId: string | null;
  activeProject?: { id?: string | null; name?: string | null } | null;
  drawingSets?: unknown[];
  setPackages?: SetPackage[];
  summariesBySet?: Map<string, SavedRevisionSummary>;
  onRevisionUploaded?: (pkgKey: string) => void | Promise<void>;
  onOpenSummary?: (summary: SavedRevisionSummary["summary"]) => void;
  onMarkTitleblock?: (setId: string) => void;
  /**
   * Sheet selection, owned by the workbench above this panel so the Bulk edit
   * action can act on it. Omitted (the standalone case) hides the column
   * entirely rather than showing checkboxes that drive nothing.
   */
  selected?: ReadonlySet<string>;
  onToggleSelect?: (drawingId: string) => void;
  onToggleSelectAll?: (drawingIds: string[]) => void;
}

const STATUS_FILTERS = [
  "all", "received", "pending_review", "reviewed", "released_for_estimate",
  "released_for_shop", "released_for_field", "on_hold", "superseded", "void",
];

const RELEASE_OPTIONS: { value: ReleaseStatus; label: string }[] = [
  { value: "released_for_estimate", label: "Estimate" },
  { value: "released_for_shop", label: "Shop" },
  { value: "released_for_field", label: "Field" },
];

const EMPTY_REGISTER_ROWS: DrawingRegisterRow[] = [];
const EMPTY_DRAWING_SETS: unknown[] = [];
const EMPTY_SET_PACKAGES: SetPackage[] = [];
const EMPTY_SUMMARIES = new Map<string, SavedRevisionSummary>();

export const DRAWING_REGISTER_VIRTUALIZE_THRESHOLD = 100;

const REGISTER_GRID_COLUMNS =
  "28px minmax(76px,.75fr) minmax(220px,2fr) minmax(64px,.65fr) minmax(180px,1.5fr) minmax(56px,.55fr) minmax(118px,1fr) 72px 72px minmax(108px,1fr) 56px";

function registerGridColumns(canRelease: boolean, selectable: boolean) {
  const base = selectable ? `32px ${REGISTER_GRID_COLUMNS}` : REGISTER_GRID_COLUMNS;
  return canRelease ? `${base} minmax(150px,1.2fr)` : base;
}

function statusTone(status: string | null): PillTone {
  if (!status) return "neutral";
  if (status === "released_for_field") return "good";
  if (status === "void") return "danger";
  if (status === "released_for_shop" || status === "on_hold" || status === "pending_review") return "warn";
  if (status === "reviewed" || status === "released_for_estimate") return "info";
  return "neutral";
}

function StatusCell({ status }: { status: string | null }) {
  const label = status ? status.replace(/_/g, " ") : "no revision";
  return <Pill tone={statusTone(status)}>{label}</Pill>;
}

function Count({ n, danger, info }: { n: number | null; danger?: boolean; info?: boolean }) {
  if (n == null) return <span aria-label="Count unavailable" title="Count unavailable">—</span>;
  const v = n;
  const color = v === 0
    ? "var(--cmd-text-muted)"
    : danger ? "var(--cmd-warn)" : info ? "var(--cmd-info)" : "var(--cmd-text)";
  return <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color }}>{v}</span>;
}

function RegisterCell({
  virtual,
  children,
  style,
}: {
  virtual: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  if (!virtual) return <td style={style}>{children}</td>;
  return (
    <div
      role="cell"
      style={{
        padding: "11px 14px",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function viewerHref(drawingId: string) {
  return `${createPageUrl("DrawingViewer")}?recordId=${encodeURIComponent(drawingId)}`;
}

export function DrawingRegisterGridPanel({
  projectId,
  activeProject,
  drawingSets = EMPTY_DRAWING_SETS,
  setPackages = EMPTY_SET_PACKAGES,
  summariesBySet = EMPTY_SUMMARIES,
  onRevisionUploaded,
  onOpenSummary,
  onMarkTitleblock,
  selected,
  onToggleSelect,
  onToggleSelectAll,
}: DrawingRegisterGridPanelProps) {
  const selectable = !!selected && !!onToggleSelect;
  const { data = EMPTY_REGISTER_ROWS, isLoading, error } = useDrawingRegister(projectId);
  const [searchParams] = useSearchParams();
  // Seeded from ?sheet= / ?search=, which is how an inbound deep link asks for
  // one sheet: the RFI board's "update drawing" action sends
  // ?sheet=<drawing_reference>, and /Drawings redirects here carrying it. The
  // retired page consumed these params; dropping them would have turned that
  // action into a link that lands on an unfiltered register. Seed-once, so
  // typing in the box is not fought by the URL.
  const [query, setQuery] = useState(
    () => searchParams.get("sheet") || searchParams.get("search") || "",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [setFilter, setSetFilter] = useState("all");
  /** Collapsed set keys when group-by-set is on. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  /** Flat clean table by default (Doc Control look). Group headers optional. */
  const [groupBySet, setGroupBySet] = useState(false);
  const { can } = usePermissions();
  const canEdit = can("edit", "drawing");
  const canRelease = can("approve", "drawing");
  const publish = usePublishRevision();
  const { data: watches } = useMyDrawingWatches(projectId);
  const toggleWatch = useToggleDrawingWatch(projectId);
  const { user } = useAppSecurity();
  const queryClient = useQueryClient();

  const [provisioning, setProvisioning] = useState<Set<string>>(new Set());
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [revisionPackage, setRevisionPackage] = useState<SetPackage | null>(null);

  const invalidateRegister = () =>
    queryClient.invalidateQueries({ queryKey: ["drawing-register", projectId] });

  const release = (row: DrawingRegisterRow, status: ReleaseStatus) => {
    if (!row.current_revision_id) { toast.error("No current revision to release."); return; }
    publish.mutate(
      { revisionId: row.current_revision_id, releaseStatus: status },
      {
        onSuccess: () => toast.success(`${row.sheet_number ?? "Sheet"} → ${status.replace(/_/g, " ")}`),
        onError: (e) => toast.error("Release failed: " + ((e as Error)?.message || "unknown")),
      }
    );
  };

  const provisionRevision = async (row: DrawingRegisterRow) => {
    const drawing = registerRowToDrawing(row);
    if (!drawing) { toast.error("This sheet is missing its project — can't set up tracking."); return; }
    setProvisioning((prev) => new Set(prev).add(row.drawing_id));
    try {
      await ensureCurrentRevision({ drawing, userId: user?.id || null });
      await invalidateRegister();
      toast.success(`${row.sheet_number ?? "Sheet"} is now releasable.`);
    } catch (e) {
      toast.error("Couldn't set up tracking: " + ((e as Error)?.message || "unknown"));
    } finally {
      setProvisioning((prev) => {
        const next = new Set(prev);
        next.delete(row.drawing_id);
        return next;
      });
    }
  };

  const provisionAll = async (untracked: DrawingRegisterRow[]) => {
    if (untracked.length === 0 || bulkProvisioning) return;
    setBulkProvisioning(true);
    try {
      const { failed } = await batchProcess(untracked, (row: DrawingRegisterRow) => {
        const drawing = registerRowToDrawing(row);
        if (!drawing) return Promise.reject(new Error("missing project"));
        return ensureCurrentRevision({ drawing, userId: user?.id || null });
      });
      await invalidateRegister();
      if (failed.length === 0) {
        toast.success(`Set up release tracking for ${untracked.length} sheet${untracked.length === 1 ? "" : "s"}.`);
      } else {
        toast.error(`${untracked.length - failed.length}/${untracked.length} set up; ${failed.length} failed.`);
      }
    } finally {
      setBulkProvisioning(false);
    }
  };

  const registerIndex = useMemo(
    () => createDrawingRegisterIndex(data, setPackages),
    [data, setPackages],
  );
  const rows = useMemo(
    () => filterIndexedRegisterRows(registerIndex, query, statusFilter, setFilter),
    [registerIndex, query, statusFilter, setFilter],
  );
  const displayRows = useMemo(
    () => buildRegisterDisplayRows(rows, groupBySet, collapsed),
    [rows, groupBySet, collapsed],
  );
  const untrackedRows = useMemo(
    () => rowsNeedingProvisioning(rows.map((entry) => entry.row)),
    [rows],
  );

  // Select-all covers what the FILTERS currently show, not the whole register.
  // A checkbox above a filtered table that silently selected hidden sheets
  // would make Bulk edit touch rows the user cannot see.
  const visibleDrawingIds = useMemo(
    () => rows.map((entry) => entry.row.drawing_id),
    [rows],
  );
  const selectedVisibleCount = useMemo(
    () => (selected ? visibleDrawingIds.filter((id) => selected.has(id)).length : 0),
    [selected, visibleDrawingIds],
  );
  const allVisibleSelected =
    visibleDrawingIds.length > 0 && selectedVisibleCount === visibleDrawingIds.length;
  const someVisibleSelected = selectedVisibleCount > 0;
  const firstVisibleDrawingByPackage = useMemo(() => {
    return deriveFirstVisibleDrawingByPackage(rows);
  }, [rows]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const colCount = (canRelease ? 12 : 11) + (selectable ? 1 : 0);

  const renderSheetCells = (entry: IndexedRegisterRow, virtual: boolean) => {
    const r = entry.row;
    const watched = !!watches?.has(r.drawing_id);
    const href = viewerHref(r.drawing_id);
    const pkg = entry.pkg;
    const showRevisionActions = !!pkg && firstVisibleDrawingByPackage.get(pkg.key) === r.drawing_id;
    const savedSummary = pkg?.setId ? summariesBySet.get(String(pkg.setId)) : undefined;
    return (
      <>
        {selectable && (
          <RegisterCell virtual={virtual} style={{ textAlign: "center", justifyContent: "center" }}>
            <input
              type="checkbox"
              checked={selected!.has(r.drawing_id)}
              onChange={() => onToggleSelect!(r.drawing_id)}
              aria-label={`Select sheet ${r.sheet_number || r.drawing_id}`}
            />
          </RegisterCell>
        )}
        <RegisterCell virtual={virtual} style={{ textAlign: "center", justifyContent: "center" }}>
          <button
            type="button"
            title={watched ? "Unwatch this sheet" : "Watch this sheet"}
            aria-pressed={watched}
            disabled={toggleWatch.isPending}
            onClick={() => toggleWatch.mutate(
              { drawingId: r.drawing_id, watched },
              { onError: (e) => toast.error("Couldn't update watch: " + ((e as Error)?.message || "unknown")) }
            )}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, color: watched ? "var(--cmd-gold)" : "var(--cmd-text-muted)" }}
          >
            <Star size={14} fill={watched ? "var(--cmd-gold)" : "none"} />
          </button>
        </RegisterCell>
        <RegisterCell virtual={virtual} style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          <Link
            to={href}
            style={{ color: "var(--cmd-accent, var(--accent))", textDecoration: "none" }}
            title="Open in drawing viewer"
          >
            {r.sheet_number || "—"}
          </Link>
        </RegisterCell>
        <RegisterCell virtual={virtual} style={{ color: "var(--cmd-text)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheet_title || "—"}</RegisterCell>
        <RegisterCell virtual={virtual} style={{ color: "var(--cmd-text-muted)" }}>{r.discipline || "—"}</RegisterCell>
        <RegisterCell
          virtual={virtual}
          style={{
            color: "var(--cmd-text-muted)",
            maxWidth: 220,
            ...(virtual ? { display: "block" } : {}),
          }}
        >
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.drawing_set_name || "—"}
          </div>
          {showRevisionActions && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              {canEdit && pkg.parent && onMarkTitleblock && (
                <TitleblockActionButton
                  setId={pkg.parent.id}
                  setName={pkg.name}
                  locked={!!pkg.parent.is_locked}
                  onMarkTitleblock={onMarkTitleblock}
                  style={{ padding: "2px 6px", fontSize: 9 }}
                />
              )}
              {savedSummary && onOpenSummary && (
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  title={`View the latest revision summary for ${pkg.name}`}
                  onClick={() => onOpenSummary(savedSummary.summary)}
                  style={{ padding: "2px 6px", fontSize: 9 }}
                >
                  Revised · {savedSummary.sheets_changed}
                </button>
              )}
              {canEdit && pkg.parent && (
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  disabled={!!pkg.parent.is_locked}
                  title={pkg.parent.is_locked
                    ? `Locked — ${pkg.parent.locked_reason || "an admin must unlock before a new revision"}`
                    : `Upload a new revision for ${pkg.name}`}
                  aria-label={`Upload revision for ${pkg.name}`}
                  onClick={() => setRevisionPackage(pkg)}
                  style={{ padding: "2px 6px", fontSize: 9 }}
                >
                  <FileUp size={11} />
                  New revision
                </button>
              )}
            </div>
          )}
        </RegisterCell>
        <RegisterCell virtual={virtual} style={{ fontVariantNumeric: "tabular-nums", color: "var(--cmd-text)", whiteSpace: "nowrap" }}>{r.current_revision || "—"}</RegisterCell>
        <RegisterCell virtual={virtual}><StatusCell status={r.current_status} /></RegisterCell>
        <RegisterCell virtual={virtual} style={{ textAlign: "center", justifyContent: "center" }}><Count n={r.open_impact_count} danger /></RegisterCell>
        <RegisterCell virtual={virtual} style={{ textAlign: "center", justifyContent: "center" }}><Count n={r.pending_review_count} info /></RegisterCell>
        <RegisterCell virtual={virtual} style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>{r.last_activity ? fmtDate(r.last_activity) : "—"}</RegisterCell>
        <RegisterCell virtual={virtual} style={{ textAlign: "center", justifyContent: "center" }}>
          <Link
            to={href}
            className="cmd-btn cmd-btn--ghost"
            title={`View ${r.sheet_number || "sheet"}`}
            aria-label={`View ${r.sheet_number || "sheet"}`}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "4px 8px", textDecoration: "none", fontSize: 11, gap: 4,
            }}
          >
            <Eye size={14} />
          </Link>
        </RegisterCell>
        {canRelease && (
          <RegisterCell virtual={virtual}>
            {r.current_revision_id ? (
              <select
                className="sbd-select"
                value=""
                disabled={publish.isPending}
                onChange={(e) => {
                  const v = e.target.value as ReleaseStatus;
                  if (v) release(r, v);
                  e.target.value = "";
                }}
                title="Release current revision"
                style={{ fontSize: 11 }}
              >
                <option value="">Release…</option>
                {RELEASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                className="cmd-btn cmd-btn--ghost"
                disabled={provisioning.has(r.drawing_id)}
                onClick={() => provisionRevision(r)}
                title="This sheet has no tracked revision yet. Set up release tracking to create its current revision so it can be released."
                style={{ fontSize: 11, whiteSpace: "nowrap" }}
              >
                {provisioning.has(r.drawing_id) && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                {provisioning.has(r.drawing_id) ? "Setting up…" : "Set up release tracking"}
              </button>
            )}
          </RegisterCell>
        )}
      </>
    );
  };

  if (!projectId) {
    return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project to view its drawing register.</div>;
  }
  if (isLoading) {
    return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Loading register…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>
        Failed to load the drawing register: {(error as Error)?.message || "Unknown error"}
      </div>
    );
  }

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>Drawing Register</h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>
            Current revision, release status, impacts, and reviews per sheet. Click a sheet to open the viewer.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            aria-pressed={groupBySet}
            onClick={() => setGroupBySet((v) => !v)}
            title="Optional: group sheet rows under drawing set headers"
            style={{
              fontSize: 12,
              border: groupBySet ? "1px solid var(--cmd-accent, var(--accent))" : undefined,
              color: groupBySet ? "var(--cmd-accent, var(--accent))" : undefined,
            }}
          >
            {groupBySet ? "Grouped by set" : "Group by set"}
          </button>
          {/* The "Full editor ↗" link that used to sit here is gone: set
              upload, rename, bulk edit and the export packages are in the
              action bar above this panel (DrawingRegisterWorkbench), so there
              is nowhere else to go. */}
        </div>
      </div>

      <div className="cmd-filterbar">
        <div className="cmd-search">
          <input
            className="cmd-search__input"
            placeholder="Filter sheet, title, discipline, set…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cmd-filterbar__filters" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="sbd-select"
            value={setFilter}
            onChange={(e) => setSetFilter(e.target.value)}
            title="Filter by drawing set"
            aria-label="Filter by drawing set"
          >
            <option value="all">All sets ({data.length})</option>
            {registerIndex.setNames.map((name) => (
              <option key={name} value={name}>{name} ({registerIndex.setCounts.get(name) || 0})</option>
            ))}
            {registerIndex.unassignedCount > 0 && (
              <option value={SET_FILTER_NONE}>
                Unassigned ({registerIndex.unassignedCount})
              </option>
            )}
          </select>
          <select
            className="sbd-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by release status"
            aria-label="Filter by release status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="cmd-filterbar__actions">
          {canRelease && untrackedRows.length > 0 && (
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              disabled={bulkProvisioning}
              onClick={() => provisionAll(untrackedRows)}
              title="Provision a tracked current revision for every visible sheet that doesn't have one yet, so they become releasable."
            >
              {bulkProvisioning && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              Set up tracking for all ({untrackedRows.length})
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>
            {data.length === 0 ? "No drawings in the register yet." : "No sheets match the filter."}
          </div>
        </div>
      ) : (
        rows.length > DRAWING_REGISTER_VIRTUALIZE_THRESHOLD ? (
          <VirtualRegisterRows
            rows={displayRows}
            canRelease={canRelease}
            selectable={selectable}
            onToggleGroup={toggleGroup}
            renderSheetCells={renderSheetCells}
          />
        ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: 32, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible sheets"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        // Indeterminate is a DOM property, not an attribute:
                        // a partial selection must not read as "none selected".
                        if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                      }}
                      onChange={() => onToggleSelectAll?.(visibleDrawingIds)}
                    />
                  </th>
                )}
                <th>Sheet</th>
                <th>Title</th>
                <th>Disc.</th>
                <th>Set</th>
                <th>Rev</th>
                <th>Status</th>
                <th style={{ textAlign: "center" }}>Impacts</th>
                <th style={{ textAlign: "center" }}>Reviews</th>
                <th>Last activity</th>
                <th style={{ width: 56 }}>View</th>
                {canRelease && <th>Release</th>}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((displayRow) => displayRow.kind === "group" ? (
                <GroupBlock
                  key={`group:${displayRow.key}`}
                  label={displayRow.label}
                  count={displayRow.count}
                  collapsed={displayRow.collapsed}
                  onToggle={() => toggleGroup(displayRow.key)}
                  colCount={colCount}
                />
              ) : (
                <tr key={displayRow.entry.row.drawing_id}>
                  {renderSheetCells(displayRow.entry, false)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}
      {canEdit && revisionPackage?.parent && (
        <Suspense fallback={<p role="status" style={{ color: "var(--cmd-text-muted)", fontSize: 12 }}>Loading revision upload…</p>}>
          <RevisionUploadModal
            open
            onClose={() => setRevisionPackage(null)}
            onComplete={() => {
              const pkgKey = revisionPackage.key;
              setRevisionPackage(null);
              void invalidateRegister();
              void onRevisionUploaded?.(pkgKey);
            }}
            activeProject={activeProject}
            preSelectedSet={revisionPackage.parent}
            drawingSets={drawingSets}
          />
        </Suspense>
      )}
    </section>
  );
}

function VirtualRegisterRows({
  rows,
  canRelease,
  selectable,
  onToggleGroup,
  renderSheetCells,
}: {
  rows: RegisterDisplayRow[];
  canRelease: boolean;
  /** Mirrors the panel's own flag so the grid template keeps the same column count. */
  selectable: boolean;
  onToggleGroup: (key: string) => void;
  renderSheetCells: (entry: IndexedRegisterRow, virtual: boolean) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => rows[index]?.kind === "group" ? 37 : 54,
    overscan: 10,
    getItemKey: (index) => {
      const displayRow = rows[index];
      return displayRow.kind === "group"
        ? `group:${displayRow.key}`
        : `sheet:${displayRow.entry.row.drawing_id}`;
    },
    initialRect: { width: 1400, height: 600 },
  });
  const columns = [
    ...(selectable ? [{ label: "Select", align: "center" }] : []),
    { label: "Watch", align: "center" },
    { label: "Sheet" },
    { label: "Title" },
    { label: "Disc." },
    { label: "Set" },
    { label: "Rev" },
    { label: "Status" },
    { label: "Impacts", align: "center" },
    { label: "Reviews", align: "center" },
    { label: "Last activity" },
    { label: "View", align: "center" },
    ...(canRelease ? [{ label: "Release" }] : []),
  ];
  const gridTemplateColumns = registerGridColumns(canRelease, selectable);

  return (
    <div
      className="cmd-table-wrap"
      role="table"
      aria-label="Drawing Register"
      aria-rowcount={rows.length + 1}
      style={{ overflowX: "auto", overflowY: "hidden" }}
    >
      <div role="rowgroup" style={{ minWidth: 1400 }}>
        <div
          role="row"
          aria-rowindex={1}
          style={{
            display: "grid",
            gridTemplateColumns,
            borderBottom: "1px solid var(--cmd-border)",
          }}
        >
          {columns.map((column, index) => (
            <div
              key={column.label}
              role="columnheader"
              aria-colindex={index + 1}
              aria-label={column.label === "Watch" || column.label === "Select" ? column.label : undefined}
              style={{
                padding: "10px 14px",
                color: "var(--cmd-text-muted)",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                textAlign: column.align === "center" ? "center" : "left",
              }}
            >
              {column.label === "Watch" || column.label === "Select" ? null : column.label}
            </div>
          ))}
        </div>
      </div>
      <div
        ref={parentRef}
        role="rowgroup"
        data-testid="drawing-register-virtual-body"
        style={{ maxHeight: 600, overflowY: "auto", minWidth: 1400 }}
      >
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const displayRow = rows[virtualRow.index];
            const sharedStyle: CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
              display: "grid",
              gridTemplateColumns,
              borderBottom: "1px solid var(--cmd-border)",
            };
            if (displayRow.kind === "group") {
              return (
                <div
                  key={`group:${displayRow.key}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  style={sharedStyle}
                >
                  <div role="cell" style={{ gridColumn: "1 / -1" }}>
                    <GroupButton
                      label={displayRow.label}
                      count={displayRow.count}
                      collapsed={displayRow.collapsed}
                      onToggle={() => onToggleGroup(displayRow.key)}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={`sheet:${displayRow.entry.row.drawing_id}`}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                style={sharedStyle}
              >
                {renderSheetCells(displayRow.entry, true)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GroupBlock({
  label,
  count,
  collapsed,
  onToggle,
  colCount,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  colCount: number;
}) {
  return (
    <tr className="cmd-table__group">
      <td colSpan={colCount} style={{ padding: 0, borderBottom: "1px solid var(--cmd-border, var(--border-default))" }}>
        <GroupButton
          label={label}
          count={count}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      </td>
    </tr>
  );
}

function GroupButton({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "8px 12px", background: "var(--cmd-surface-2, color-mix(in srgb, var(--bg-surface-high, #1a1f27) 80%, transparent))",
        border: "none", cursor: "pointer", textAlign: "left",
        color: "var(--cmd-text)", fontFamily: "var(--font-mono, inherit)",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
      }}
    >
      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: "var(--cmd-text-muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
        {count} sheet{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
