import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";
import { CommandBar, KpiTile } from "@/components/design-system";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { deriveOperationalConstraints } from "@/services/constraintEngine";
import { summarizeBlockingConstraints } from "@/services/scheduleGatekeeper";
import {
  buildWpLabelById,
  buildRfisById,
  groupLookAheadItems,
  computeLookAheadStats,
} from "./lookAheadSchedule/lookAheadScheduleHelpers";
import {
  PHASE_COLORS,
  LookAheadModal,
  StatusLozenge,
  MiniProgressBar,
  FabricationShield,
} from "./lookAheadSchedule/LookAheadScheduleUi";

export default function LookAheadSchedule() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [groupBy, setGroupBy] = useState("Phase");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current 2-week window

  const {
    data: items = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lookahead", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.LookAhead.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });
  const projects = [activeProject].filter(Boolean);

  // Blocking Fabrication Shield — deterministically derive the unresolved
  // High/Critical RFI constraints for this project and surface them so a
  // planner sees what gates fabrication/delivery/erection before scheduling.
  const { data: rfis = [] } = useQuery({
    queryKey: ["lookahead-rfis", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.RFI.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["lookahead-wps", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.WorkPackage.filter({ project_id: activeProject.id })
      : [],
    enabled: !!activeProject?.id,
  });
  const rfisById = useMemo(
    () => buildRfisById(rfis),
    [rfis],
  );
  const wpLabelById = useMemo(
    () => buildWpLabelById(workPackages),
    [workPackages],
  );
  const shield = useMemo(
    () => summarizeBlockingConstraints(deriveOperationalConstraints({ rfis }, {}), { rfisById }),
    [rfis, rfisById],
  );

  const createMut = useMutation({
    mutationFn: (d) => entities.LookAhead.create(withProjectId(d, activeProject?.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item created");
    },
    onError: (err) => {
      toast.error(`Failed to create look-ahead item: ${toUserErrorMessage(err)}`);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.LookAhead.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Look-ahead item updated");
    },
    onError: (err) => {
      toast.error(`Failed to update look-ahead item: ${toUserErrorMessage(err)}`);
    },
  });
  const deleteMut = useMutation({
    mutationFn: id => entities.LookAhead.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["lookahead"] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      setDeleteTarget(null);
      toast.success("Look-ahead item deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to delete look-ahead item")),
  });
  const handleSave = (d) => { if (editing) updateMut.mutate({ id: editing.id, data: d }); else createMut.mutate(d); };

  // Compute 2-week window based on weekOffset
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() + weekOffset * 14);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + 14);

  const fmtWindow = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Group items — bucket once per (groupBy, items) instead of re-filtering the
  // full list once per group key on every render (was O(groups·items) each pass
  // and produced new key/array references that defeated row memoization).
  const { groupKeys, itemsByGroup } = useMemo(
    () => groupLookAheadItems(items, groupBy),
    [groupBy, items],
  );

  const getGroupItems = (key) => itemsByGroup.get(key) || [];

  const stats = useMemo(() => computeLookAheadStats(items), [items]);

  if (!activeProject?.id) return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Select a Project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right to view the 2-week look-ahead.</div>
    </div>
  );

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={activeProject?.project_name || "SCHEDULE"}
        title="2-Week Look-Ahead"
        count={items.length}
        unit=" · ACTIVITIES"
        subtitle={`${fmtWindow(windowStart)} – ${fmtWindow(windowEnd)}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6 }}>
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            style={{ display: "flex", alignItems: "center", padding: "4px 6px", background: "transparent", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: weekOffset === 0 ? "var(--text-muted)" : "var(--accent)", background: "none", border: "none", cursor: weekOffset === 0 ? "default" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px" }}
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            style={{ display: "flex", alignItems: "center", padding: "4px 6px", background: "transparent", border: "none", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)" }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {["Phase", "Crew", "Project"].map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              style={{
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "none",
                borderRight: g !== "Project" ? "1px solid var(--border-default)" : "none",
                background: groupBy === g ? "var(--accent-muted)" : "transparent",
                color: groupBy === g ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {g}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--bg-base)", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--accent-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--accent)"}
        >
          <Plus size={12} /> Add Item
        </button>
        <button
          onClick={refetch}
          title="Refresh"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", cursor: "pointer", letterSpacing: "0.06em" }}
        >
          <RefreshCw size={12} />
        </button>
      </CommandBar>

      <FabricationShield shield={shield} wpLabelById={wpLabelById} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Activities"   value={stats.total}       color="var(--accent)" />
        <KpiTile compact label="In Progress"  value={stats.inProgress}  color="var(--phase-fabrication)" />
        <KpiTile compact label="Complete"     value={stats.complete}    color="var(--status-success)" />
        <KpiTile compact label="Delayed"      value={stats.delayed}     color="var(--status-error)" />
        <KpiTile compact label="Avg Progress" value={`${stats.avgProgress}%`} color="var(--phase-detailing)" />
      </div>

      {/* Table */}
      <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-low)", zIndex: 2, borderBottom: "2px solid var(--border-default)" }}>
                {[
                  { label: "Activity",       width: "22%" },
                  { label: "Phase",          width: "9%"  },
                  { label: "Crew",           width: "9%"  },
                  { label: "Planned Start",  width: "9%"  },
                  { label: "Planned End",    width: "9%"  },
                  { label: "Forecast End",   width: "9%"  },
                  { label: "Progress",       width: "12%" },
                  { label: "Constraints",    width: "12%" },
                  { label: "Status",         width: "11%" },
                  { label: "",               width: "8%"  },
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      width: col.width,
                      padding: "10px 12px",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} style={{ padding: 24 }}>
                    <LoadingSkeleton variant="table" rows={6} />
                  </td>
                </tr>
              )}

              {!isLoading && isError && (
                <tr>
                  <td colSpan={10} style={{ padding: "48px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Couldn’t load look-ahead items
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
                      {toUserErrorMessage(error, "Something went wrong. Try again.")}
                    </div>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      style={{
                        background: "transparent",
                        color: "var(--accent)",
                        border: "1px solid var(--accent)",
                        borderRadius: "var(--radius-btn)",
                        padding: "8px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div style={{ padding: "64px 24px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>No Look-Ahead Items</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
                        Start tracking upcoming work for this 2-week window.
                      </div>
                      <button
                        onClick={() => { setEditing(null); setModalOpen(true); }}
                        style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius-btn)", padding: "10px 20px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
                      >
                        + Add First Look-Ahead Item
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && groupKeys.map(key => {
                const grpItems = getGroupItems(key);
                if (grpItems.length === 0) return null;
                const phaseCfg = PHASE_COLORS[key];
                return (
                  <React.Fragment key={key}>
                    {/* Group header row */}
                    <tr style={{ background: "var(--bg-surface-low)" }}>
                      <td colSpan={10} style={{ padding: "7px 12px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: phaseCfg?.bg || "color-mix(in srgb, var(--text-muted) 12%, transparent)",
                          color: phaseCfg?.color || "var(--text-muted)",
                          border: `1px solid ${phaseCfg?.border || "color-mix(in srgb, var(--text-muted) 30%, transparent)"}`,
                          borderRadius: 6, padding: "2px 10px",
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          {key}
                          <span style={{ opacity: 0.6, fontSize: 9 }}>· {grpItems.length}</span>
                        </span>
                      </td>
                    </tr>
                    {grpItems.map((item, idx) => {
                      const isDelayed = item.status === "Delayed";
                      const forecastLate = item.forecast_end && item.planned_end && item.forecast_end > item.planned_end;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => { setEditing(item); setModalOpen(true); }}
                          style={{
                            cursor: "pointer",
                            background: isDelayed ? "color-mix(in srgb, var(--status-warning) 4%, transparent)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)",
                            borderBottom: "1px solid var(--divider)",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                          onMouseLeave={e => e.currentTarget.style.background = isDelayed ? "color-mix(in srgb, var(--status-warning) 4%, transparent)" : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-low)"}
                        >
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                            {item.activity}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {item.phase && (
                              <span style={{
                                background: PHASE_COLORS[item.phase]?.bg || "color-mix(in srgb, var(--text-muted) 10%, transparent)",
                                color: PHASE_COLORS[item.phase]?.color || "var(--text-muted)",
                                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                                borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>{item.phase}</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                            {item.crew || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                            {formatDate(item.planned_start) || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                            {formatDate(item.planned_end) || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: forecastLate ? 700 : 400, color: forecastLate ? "var(--status-error)" : "var(--text-muted)" }}>
                            {formatDate(item.forecast_end) || "—"}
                            {forecastLate && <span style={{ marginLeft: 4, fontSize: 9 }}>⚠</span>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <MiniProgressBar value={item.percent_complete} />
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.constraints || "—"}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <StatusLozenge status={item.status} />
                          </td>
                          <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => { setEditing(item); setModalOpen(true); }}
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid color-mix(in srgb, var(--status-error) 30%, transparent)", borderRadius: 6, color: "var(--status-error)", cursor: "pointer" }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <LookAheadModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        item={editing}
        projects={projects}
        isSaving={createMut.isPending || updateMut.isPending}
        blockers={shield.blockers}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }}
        title="Delete Item"
        description={`Delete "${deleteTarget?.activity}"?`}
      />
    </div>
  );
}
