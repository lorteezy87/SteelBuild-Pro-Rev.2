/**
 * DrawingRegisterGridPanel — the on-skin Doc Control "Register" view (Slice 2c).
 *
 * Presentation-only re-skin of DrawingRegisterGrid onto the command_ui kit. Every
 * query, mutation, permission gate, provisioning path, watch toggle, and the
 * `["drawing-register", projectId]` cache-key invalidation are UNCHANGED — this
 * panel reuses the exact same hooks + handlers as the legacy grid; only the chrome
 * (card / filter row / table / status chip) is swapped to `cmd-*` primitives.
 *
 * The panel renders inside the DetailingCommandShell light island
 * ([data-skin="command"] on <html>). The reused native form controls (the status
 * <select>, the search <input>, and the per-row Release <select>) carry `sbd-*`
 * classes whose light styling comes from the shipped `.detailing-cc` token cascade,
 * so the panel root is `.detailing-cc` — matching Slice 2b.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, Loader2 } from "lucide-react";
import { useDrawingRegister, type DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { usePublishRevision, type ReleaseStatus } from "@/hooks/usePublishRevision";
import { useMyDrawingWatches, useToggleDrawingWatch } from "@/hooks/useDrawingWatch";
import { usePermissions } from "@/services/permissions";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { ensureCurrentRevision } from "@/lib/drawingHub/revisions";
import { batchProcess } from "@/utils/batchProcess";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { registerRowToDrawing, rowsNeedingProvisioning } from "./registerProvision";
import { filterRegisterRows } from "./docControl.derive";

const STATUS_FILTERS = [
  "all", "received", "pending_review", "reviewed", "released_for_estimate",
  "released_for_shop", "released_for_field", "on_hold", "superseded", "void",
];

const RELEASE_OPTIONS: { value: ReleaseStatus; label: string }[] = [
  { value: "released_for_estimate", label: "Estimate" },
  { value: "released_for_shop", label: "Shop" },
  { value: "released_for_field", label: "Field" },
];

/** Map a release status to a kit Pill tone. Mirrors the legacy STATUS_TONE hues:
 *  field-released → good, shop/on-hold/pending → warn, void → danger, reviewed/
 *  estimate → info, else neutral. */
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
  const v = n ?? 0;
  const color = v === 0
    ? "var(--cmd-text-muted)"
    : danger ? "var(--cmd-warn)" : info ? "var(--cmd-info)" : "var(--cmd-text)";
  return <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color }}>{v}</span>;
}

export function DrawingRegisterGridPanel({ projectId }: { projectId: string | null }) {
  const { data = [], isLoading, error } = useDrawingRegister(projectId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const rows = useMemo(() => filterRegisterRows(data, query, statusFilter), [data, query, statusFilter]);
  const untrackedRows = useMemo(() => rowsNeedingProvisioning(rows), [rows]);

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
            Current revision + release status + downstream counts per sheet. Filter to “Released for field” for the crew’s current-sheet view.
          </p>
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
        <div className="cmd-filterbar__filters">
          <select
            className="sbd-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by release status"
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
                {canRelease && <th>Release</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const watched = !!watches?.has(r.drawing_id);
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
                    <td style={{ fontWeight: 700, color: "var(--cmd-text)", whiteSpace: "nowrap" }}>{r.sheet_number || "—"}</td>
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
