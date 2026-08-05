/**
 * DrawingRegisterGridPanel — the on-skin Doc Control "Register" view (Slice 2c).
 *
 * Sheet-level register (Doc Control clean table):
 *  - free-text + status + drawing-set filters
 *  - flat sheet rows by default; optional group-by-set
 *  - click sheet # / View to open DrawingViewer
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, Loader2, ChevronDown, ChevronRight, Eye, ExternalLink } from "lucide-react";
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
import { registerRowToDrawing, rowsNeedingProvisioning } from "./registerProvision";
import {
  filterRegisterRows,
  listDrawingSetNames,
  groupRegisterRowsBySet,
  SET_FILTER_NONE,
} from "./docControl.derive";
import { statusTone } from "./drawingRegisterGridPanelHelpers";

const STATUS_FILTERS = [
  "all", "received", "pending_review", "reviewed", "released_for_estimate",
  "released_for_shop", "released_for_field", "on_hold", "superseded", "void",
];

const RELEASE_OPTIONS: { value: ReleaseStatus; label: string }[] = [
  { value: "released_for_estimate", label: "Estimate" },
  { value: "released_for_shop", label: "Shop" },
  { value: "released_for_field", label: "Field" },
];

function StatusCell({ status }: { status: string | null }) {
  const label = status ? status.replace(/_/g, " ") : "no revision";
  return <Pill tone={statusTone(status)}>{label}</Pill>;
}

function Count({ n, danger, info }: { n: number | null; danger?: boolean; info?: boolean }) {
  const v = n ?? 0;
  const color = v === 0
    ? "var(--cmd-text-muted)"
    : danger ? "var(--cmd-warn)" : info ? "var(--cmd-info)" : "var(--cmd-text)";
  return <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color }}>{v}</span>;
}

function viewerHref(drawingId: string) {
  return `${createPageUrl("DrawingViewer")}?recordId=${encodeURIComponent(drawingId)}`;
}

export function DrawingRegisterGridPanel({ projectId }: { projectId: string | null }) {
  const { data = [], isLoading, error } = useDrawingRegister(projectId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [setFilter, setSetFilter] = useState("all");
  /** Collapsed set keys when group-by-set is on. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  /** Flat clean table by default (Doc Control look). Group headers optional. */
  const [groupBySet, setGroupBySet] = useState(false);
  const { can } = usePermissions();
  const canRelease = can("approve", "drawing");
  const publish = usePublishRevision();
  const { data: watches } = useMyDrawingWatches(projectId);
  const toggleWatch = useToggleDrawingWatch(projectId);
  const { user } = useAppSecurity();
  const queryClient = useQueryClient();

  const [provisioning, setProvisioning] = useState<Set<string>>(new Set());
  const [bulkProvisioning, setBulkProvisioning] = useState(false);

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

  const setNames = useMemo(() => listDrawingSetNames(data), [data]);
  const hasUnassigned = useMemo(
    () => data.some((r) => !(r.drawing_set_name || "").trim()),
    [data],
  );

  const rows = useMemo(
    () => filterRegisterRows(data, query, statusFilter, setFilter),
    [data, query, statusFilter, setFilter],
  );
  const groups = useMemo(() => groupRegisterRowsBySet(rows), [rows]);
  const untrackedRows = useMemo(() => rowsNeedingProvisioning(rows), [rows]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const colCount = canRelease ? 14 : 13;

  const renderSheetRow = (r: DrawingRegisterRow) => {
    const watched = !!watches?.has(r.drawing_id);
    const href = viewerHref(r.drawing_id);
    return (
      <tr key={r.drawing_id}>
        <td style={{ textAlign: "center" }}>
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
        </td>
        <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          <Link
            to={href}
            style={{ color: "var(--cmd-accent, var(--accent))", textDecoration: "none" }}
            title="Open in drawing viewer"
          >
            {r.sheet_number || "—"}
          </Link>
        </td>
        <td style={{ color: "var(--cmd-text)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheet_title || "—"}</td>
        <td style={{ color: "var(--cmd-text-muted)" }}>{r.discipline || "—"}</td>
        <td style={{ color: "var(--cmd-text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.drawing_set_name || "—"}</td>
        <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--cmd-text)", whiteSpace: "nowrap" }}>{r.current_revision || "—"}</td>
        <td><StatusCell status={r.current_status} /></td>
        <td style={{ textAlign: "center" }}><Count n={r.open_impact_count} danger /></td>
        <td style={{ textAlign: "center" }}><Count n={r.pending_review_count} info /></td>
        <td style={{ textAlign: "center" }}><Count n={r.rfi_count} /></td>
        <td style={{ textAlign: "center" }}><Count n={r.work_package_count} /></td>
        <td style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>{r.last_activity ? fmtDate(r.last_activity) : "—"}</td>
        <td style={{ textAlign: "center" }}>
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
        </td>
        {canRelease && (
          <td>
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
          </td>
        )}
      </tr>
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
            Current revision + release status + downstream counts per sheet. Click a sheet to open the viewer.
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
          <Link
            to={createPageUrl("Drawings")}
            className="cmd-btn cmd-btn--ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12 }}
            title="Open the full Drawings editor for set upload, rename, bulk edit"
          >
            <ExternalLink size={13} />
            Full editor
          </Link>
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
            {setNames.map((name) => {
              const n = data.filter((r) => (r.drawing_set_name || "") === name).length;
              return (
                <option key={name} value={name}>{name} ({n})</option>
              );
            })}
            {hasUnassigned && (
              <option value={SET_FILTER_NONE}>
                Unassigned ({data.filter((r) => !(r.drawing_set_name || "").trim()).length})
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
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th aria-label="Watch" style={{ width: 28 }} />
                <th>Sheet</th>
                <th>Title</th>
                <th>Disc.</th>
                <th>Set</th>
                <th>Rev</th>
                <th>Status</th>
                <th style={{ textAlign: "center" }}>Impacts</th>
                <th style={{ textAlign: "center" }}>Reviews</th>
                <th style={{ textAlign: "center" }}>RFIs</th>
                <th style={{ textAlign: "center" }}>WPs</th>
                <th>Last activity</th>
                <th style={{ width: 56 }}>View</th>
                {canRelease && <th>Release</th>}
              </tr>
            </thead>
            <tbody>
              {groupBySet
                ? groups.map((g) => {
                    const groupKey = g.setName ?? SET_FILTER_NONE;
                    const isCollapsed = collapsed.has(groupKey);
                    const label = g.setName || "Unassigned";
                    return (
                      <GroupBlock
                        key={groupKey}
                        label={label}
                        count={g.rows.length}
                        collapsed={isCollapsed}
                        onToggle={() => toggleGroup(groupKey)}
                        colCount={colCount}
                      >
                        {g.rows.map(renderSheetRow)}
                      </GroupBlock>
                    );
                  })
                : rows.map(renderSheetRow)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GroupBlock({
  label,
  count,
  collapsed,
  onToggle,
  colCount,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  colCount: number;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="cmd-table__group">
        <td colSpan={colCount} style={{ padding: 0, borderBottom: "1px solid var(--cmd-border, var(--border-default))" }}>
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
        </td>
      </tr>
      {!collapsed && children}
    </>
  );
}
