/**
 * DrawingRegisterGrid — legacy register-first document-control view.
 *
 * LEGACY (kept for unit tests in `__tests__/DrawingRegisterGrid.test.tsx`).
 * Canonical Doc Control UI for production: `DrawingRegisterGridPanel`
 * (wired by `DocControlPanel`). Do not add new call sites to this file —
 * extend the Panel instead.
 *
 * One row per active sheet: current revision + release status + open-impact /
 * pending-review / RFI / work-package counts, sourced from `drawing_register_view`.
 *
 * Slice 2 adds release control: a status filter (select "Released for field" for
 * field-release mode — the "one current source of truth" crews work from) and a
 * per-row Release action (PM+ only) that calls publish_drawing_revision to set
 * the current revision's release status. The RPC enforces project membership
 * server-side; the UI gate here is display-only.
 *
 * Provision-on-demand: normal drawing intake doesn't create a `drawing_revisions`
 * row, so most rows arrive with no `current_revision_id` and the Release control
 * would be dead. For those rows we show a "Set up release tracking" button that
 * idempotently provisions a v1 current revision (the same `ensureCurrentRevision`
 * mechanism the 3D viewer uses), then refetches the register so the Release
 * dropdown appears. A header bulk action does the same for every untracked row.
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
import { registerRowToDrawing, rowsNeedingProvisioning } from "./registerProvision";

const STATUS_TONE: Record<string, string> = {
  received: "var(--text-muted)",
  pending_review: "var(--status-warning)",
  reviewed: "var(--status-info)",
  released_for_estimate: "var(--status-info)",
  released_for_shop: "var(--status-warning)",
  released_for_field: "var(--status-success)",
  on_hold: "var(--status-warning)",
  superseded: "var(--text-muted)",
  void: "var(--status-error)",
};

const STATUS_FILTERS = [
  "all", "received", "pending_review", "reviewed", "released_for_estimate",
  "released_for_shop", "released_for_field", "on_hold", "superseded", "void",
];

const RELEASE_OPTIONS: { value: ReleaseStatus; label: string }[] = [
  { value: "released_for_estimate", label: "Estimate" },
  { value: "released_for_shop", label: "Shop" },
  { value: "released_for_field", label: "Field" },
];

const muted = "var(--text-muted)";
const primary = "var(--text-primary)";
const mono = "var(--font-mono)";

function StatusChip({ status }: { status: string | null }) {
  const tone = (status && STATUS_TONE[status]) || muted;
  const label = status ? status.replace(/_/g, " ") : "no revision";
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      color: tone, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
      background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
    }}>
      {label}
    </span>
  );
}

function Count({ n, tone }: { n: number | null; tone?: string }) {
  const v = n ?? 0;
  return (
    <span className="sbd-num" style={{ fontFamily: mono, fontSize: 12, color: v > 0 ? (tone || primary) : muted }}>
      {v}
    </span>
  );
}

export function DrawingRegisterGrid({ projectId }: { projectId: string | null }) {
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

  // Per-row in-flight provisioning (drawing_id set) + a bulk-action flag.
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

  // Idempotent provision-on-demand: fetch-or-create the row's current revision
  // (seeded from its own metadata), then refetch the register so the Release
  // dropdown appears. ensureCurrentRevision's insert runs under the caller's RLS
  // (same path the 3D viewer already uses), so no extra access check is needed.
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
      // `batchProcess` is untyped JS, so its callback param doesn't infer from
      // `untracked: DrawingRegisterRow[]` — annotate to satisfy noImplicitAny.
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((r: DrawingRegisterRow) => {
      if (statusFilter !== "all" && r.current_status !== statusFilter) return false;
      if (!q) return true;
      return [r.sheet_number, r.sheet_title, r.discipline, r.drawing_set_name, r.current_status]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [data, query, statusFilter]);

  // Visible rows still lacking a current revision — drives the header bulk action.
  const untrackedRows = useMemo(() => rowsNeedingProvisioning(rows), [rows]);

  if (!projectId) {
    return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Select a project to view its drawing register.</div>;
  }
  if (isLoading) {
    return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Loading register…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--status-error)", fontSize: 13 }}>
        Failed to load the drawing register: {(error as Error)?.message || "Unknown error"}
      </div>
    );
  }

  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: primary, fontSize: 16 }}>Drawing Register</h3>
          <p style={{ margin: "4px 0 0", color: muted, fontSize: 12 }}>
            Current revision + release status + downstream counts per sheet. Filter to “Released for field” for the crew’s current-sheet view.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {canRelease && untrackedRows.length > 0 && (
            <button
              type="button"
              className="sbd-btn sbd-btn-ghost"
              disabled={bulkProvisioning}
              onClick={() => provisionAll(untrackedRows)}
              title="Provision a tracked current revision for every visible sheet that doesn't have one yet, so they become releasable."
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, whiteSpace: "nowrap" }}
            >
              {bulkProvisioning && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              Set up tracking for all ({untrackedRows.length})
            </button>
          )}
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
          <input
            className="sbd-input"
            placeholder="Filter sheet, title, discipline, set…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 220, maxWidth: 360 }}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: muted, fontSize: 13 }}>
          {data.length === 0 ? "No drawings in the register yet." : "No sheets match the filter."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: muted, fontFamily: mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <th style={{ padding: "6px 4px", width: 28 }} aria-label="Watch" />
                <th style={{ padding: "6px 8px" }}>Sheet</th>
                <th style={{ padding: "6px 8px" }}>Title</th>
                <th style={{ padding: "6px 8px" }}>Disc.</th>
                <th style={{ padding: "6px 8px" }}>Set</th>
                <th style={{ padding: "6px 8px" }}>Rev</th>
                <th style={{ padding: "6px 8px" }}>Status</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Impacts</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Reviews</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>RFIs</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>WPs</th>
                <th style={{ padding: "6px 8px" }}>Last activity</th>
                {canRelease && <th style={{ padding: "6px 8px" }}>Release</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.drawing_id} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "8px 4px", textAlign: "center" }}>
                    {(() => {
                      const watched = !!watches?.has(r.drawing_id);
                      return (
                        <button
                          type="button"
                          title={watched ? "Unwatch this sheet" : "Watch this sheet"}
                          aria-pressed={watched}
                          disabled={toggleWatch.isPending}
                          onClick={() => toggleWatch.mutate(
                            { drawingId: r.drawing_id, watched },
                            { onError: (e) => toast.error("Couldn't update watch: " + ((e as Error)?.message || "unknown")) }
                          )}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, color: watched ? "var(--accent)" : muted }}
                        >
                          <Star size={14} fill={watched ? "var(--accent)" : "none"} />
                        </button>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "8px", fontWeight: 700, color: primary, whiteSpace: "nowrap" }}>{r.sheet_number || "—"}</td>
                  <td style={{ padding: "8px", color: primary, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheet_title || "—"}</td>
                  <td style={{ padding: "8px", color: muted }}>{r.discipline || "—"}</td>
                  <td style={{ padding: "8px", color: muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.drawing_set_name || "—"}</td>
                  <td style={{ padding: "8px", fontFamily: mono, color: primary, whiteSpace: "nowrap" }}>{r.current_revision || "—"}</td>
                  <td style={{ padding: "8px" }}><StatusChip status={r.current_status} /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.open_impact_count} tone="var(--status-warning)" /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.pending_review_count} tone="var(--status-info)" /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.rfi_count} /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.work_package_count} /></td>
                  <td style={{ padding: "8px", color: muted, whiteSpace: "nowrap" }}>{r.last_activity ? fmtDate(r.last_activity) : "—"}</td>
                  {canRelease && (
                    <td style={{ padding: "8px" }}>
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
                          className="sbd-btn sbd-btn-ghost"
                          disabled={provisioning.has(r.drawing_id)}
                          onClick={() => provisionRevision(r)}
                          title="This sheet has no tracked revision yet. Set up release tracking to create its current revision so it can be released."
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, whiteSpace: "nowrap" }}
                        >
                          {provisioning.has(r.drawing_id) && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                          {provisioning.has(r.drawing_id) ? "Setting up…" : "Set up release tracking"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
