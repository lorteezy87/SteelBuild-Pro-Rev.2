import { AlertTriangle, Clock3, UserCheck, Users } from "lucide-react";
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";
import { hoursToWorkdays } from "@/lib/workweek";
import { buildHoursSummaryCells, formatHours, formatShortDate, type ScheduleStats } from "./format";
import {
  extractSkillsRS,
  getRowCapacityBg,
  GHOST_RESOURCES_SCHED,
  PHASE_FILTER_OPTIONS,
  phaseFilterColor,
} from "./utils";
import UnscheduledTray from "./UnscheduledTray";
import { RESOURCE_TYPES } from "./resourceSchedulingHelpers";

export function ResourceGuruCommandStrip({ plan, focus, onFocusChange }) {
  const focusOptions = [
    { id: "all", label: "All", count: plan.resourceRows.length },
    { id: "personnel", label: "People", count: plan.personnelCount },
    { id: "equipment", label: "Equipment", count: plan.equipmentCount },
    { id: "available", label: "Available", count: plan.resourceRows.filter((row) => !row.unavailable && row.remainingHours > 0).length },
    { id: "issues", label: "Clashes", count: plan.issueRows.length },
  ];
  const roster = plan.resourceRows.slice(0, 6);
  const queue = plan.waitingList.slice(0, 5);

  return (
    <section className="resource-guru-strip" style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
      gap: 12,
      padding: 14,
      border: "1px solid var(--border-default)",
      borderRadius: 12,
      background: "var(--bg-surface)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800 }}>
              Resource Guru Lens
            </div>
            <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              People, bookings, capacity, and clashes in one planning strip.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {focusOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onFocusChange(option.id)}
                style={{
                  minHeight: 34,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: focus === option.id ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: focus === option.id ? "var(--accent-muted)" : "var(--bg-input)",
                  color: focus === option.id ? "var(--accent)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
          <GuruMetric icon={Users} label="People" value={plan.personnelCount} sub={`${plan.onLeaveCount} unavailable`} color="var(--accent)" />
          <GuruMetric icon={UserCheck} label="Open Capacity" value={formatHours(plan.openCapacityHours)} sub={`${plan.utilizationPct}% booked`} color={plan.utilizationPct > 100 ? "var(--status-error)" : "var(--status-success)"} />
          <GuruMetric icon={AlertTriangle} label="Clashes" value={plan.clashCount} sub={`${plan.nearCapacityCount} tight`} color={plan.clashCount ? "var(--status-error)" : "var(--status-success)"} />
          <GuruMetric icon={Clock3} label="Waiting List" value={plan.waitingList.length} sub="Needs assignment" color={plan.waitingList.length ? "var(--status-warning)" : "var(--status-success)"} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
          {roster.map((row) => (
            <div key={row.resource.id} style={{
              minWidth: 0,
              padding: 10,
              borderRadius: 10,
              border: row.overAllocated ? "1px solid var(--danger-border)" : "1px solid var(--border-default)",
              background: row.overAllocated ? "var(--danger-muted)" : "var(--bg-surface-low)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.resource.name || "Unnamed resource"}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {row.type} / {row.resource.role || "No role"}
                  </div>
                </div>
                <span style={{ color: row.overAllocated ? "var(--status-error)" : row.unavailable ? "var(--text-muted)" : "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {row.unavailable ? row.status : `${row.utilizationPct}%`}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "var(--border-default)", overflow: "hidden", margin: "8px 0 6px" }}>
                <div style={{
                  width: `${Math.min(100, row.utilizationPct)}%`,
                  height: "100%",
                  background: row.overAllocated ? "var(--status-error)" : row.nearCapacity ? "var(--status-warning)" : "var(--accent)",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8 }}>
                <span>{formatHours(row.assignedHours)} / {formatHours(row.capacityHours)}</span>
                <span>{formatShortDate(row.nextBookingDate)}</span>
              </div>
              {row.flags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {row.flags.slice(0, 2).map((flag) => (
                    <span key={flag} style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: 999,
                      padding: "2px 6px",
                      color: row.overAllocated ? "var(--status-error)" : "var(--text-secondary)",
                      background: "var(--bg-input)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}>
                      {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <aside style={{ minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-surface-low)", padding: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800, marginBottom: 8 }}>
          Waiting List / Approval Queue
        </div>
        {queue.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {queue.map((item) => (
              <div key={item.key} style={{ padding: 8, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-input)" }}>
                <div style={{ color: "var(--text-primary)", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </div>
                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {item.type} / {item.reason}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5, padding: "12px 4px" }}>
            No unassigned demand or over-capacity bookings in the current filter.
          </div>
        )}
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 10, lineHeight: 1.6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          No auto-overbooking. Move the booking, adjust dates, or approve capacity changes from the project team.
        </div>
      </aside>
    </section>
  );
}

export function GuruMetric({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ minWidth: 0, padding: 10, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-surface-low)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color }}>
        <Icon size={14} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ color, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginTop: 7, lineHeight: 1 }}>{value}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 5 }}>{sub}</div>
    </div>
  );
}

export function SchedulingToolbar({
  viewMode,
  onViewModeChange,
  zoomMode,
  onZoomModeChange,
  filterPhase,
  onFilterPhaseChange,
}) {
  return (
    <>
      <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
        {[{ id: "board", label: "Board" }, { id: "capacity", label: "Capacity" }].map(v => (
          <button key={v.id} onClick={() => onViewModeChange(v.id)} style={{
            padding: "6px 12px",
            border: "none",
            borderRight: v.id !== "capacity" ? "1px solid var(--border-default)" : "none",
            background: viewMode === v.id ? "var(--accent-muted)" : "transparent",
            color: viewMode === v.id ? "var(--accent)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}>{v.label}</button>
        ))}
      </div>

      <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
        {["week", "month", "quarter"].map((mode, i) => (
          <button
            key={mode}
            onClick={() => onZoomModeChange(mode)}
            style={{
              padding: "6px 12px",
              border: "none",
              borderRight: i < 2 ? "1px solid var(--border-default)" : "none",
              background: zoomMode === mode ? "var(--accent-muted)" : "transparent",
              color: zoomMode === mode ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {PHASE_FILTER_OPTIONS.map((p) => {
          const phaseColor = phaseFilterColor(p);
          const active = filterPhase === p;
          return (
            <button
              key={p}
              onClick={() => onFilterPhaseChange(p)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: active ? `1px solid ${phaseColor}` : "1px solid var(--border-default)",
                background: active ? "color-mix(in srgb, " + phaseColor + " 14%, transparent)" : "transparent",
                color: active ? phaseColor : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {p === "all" ? "All Phases" : p}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BoardEmptyState({ onAddResource }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 40 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        No Resources Assigned
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
        Add crew, equipment, and work packages to start building your resource schedule. Drag work packages onto resources to assign them.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 520, marginTop: 8 }}>
        {GHOST_RESOURCES_SCHED.map((ghost, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "var(--bg-surface-low)",
              border: "1px dashed var(--bg-surface-high)",
              borderRadius: "var(--radius-card)",
              animation: "rsGhostShimmer 2.5s ease-in-out infinite",
              animationDelay: `${i * 0.35}s`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-disabled)" }}>{ghost.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.role}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {ghost.skills.map((s) => (
                <span key={s} style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                  color: "var(--text-disabled)", background: "var(--hover-bg)",
                  border: "1px solid var(--divider)", borderRadius: 10,
                  padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.04em",
                }}>{s}</span>
              ))}
            </div>
            <div style={{
              width: 100, height: 20, borderRadius: 4,
              background: "var(--hover-bg)", border: "1px dashed var(--divider)",
            }} />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          onClick={onAddResource}
          style={{
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "10px 24px",
            fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700,
            cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
            minHeight: 44, transition: "background 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "var(--shadow-glow-gold)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          + Add First Resource
        </button>
      </div>
    </div>
  );
}

export function HoursSummaryStrip({ stats }: { stats: ScheduleStats }) {
  const cells = buildHoursSummaryCells(stats);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8,
      padding: "8px 16px", borderBottom: "1px solid var(--divider)",
      background: "var(--bg-page)", flexShrink: 0,
    }}>
      {cells.map(({ label, value, color }) => {
        const isOverAlloc = label === "OVER-ALLOCATED" && Number(value) > 0;
        return (
          <div key={label} style={{
            padding: "6px 10px", background: "var(--hover-bg)", borderRadius: 6,
            border: isOverAlloc ? "1px solid rgba(239,68,68,0.35)" : "1px solid var(--hover-bg)",
            animation: isOverAlloc ? "rsOverAllocPulse 2s ease-in-out infinite" : undefined,
            transition: "border-color 0.2s",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color }}>{value}</div>
          </div>
        );
      })}
    </div>
  );
}


export function ResourcesSidebar({
  topLevelResources,
  scheduledWps,
  effectiveCapacityById,
  membersByParentId,
  unscheduledWps,
  onUnscheduledPointerDown,
  onOpenContextMenu,
}) {
  return (
    <div
      style={{
        width: 260,
        background: "var(--bg-page)",
        borderRight: "1px solid var(--border-default)",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--status-warning)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 12,
          fontWeight: 700,
        }}
      >
        RESOURCES
      </div>

      {RESOURCE_TYPES.map(type => {
        const typeResources = topLevelResources.filter(r => (r.resource_type || "Person") === type);
        if (typeResources.length === 0) return null;
        return (
          <div key={type}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
              letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 0 4px",
              borderBottom: "1px solid var(--border-default)", marginBottom: 6,
            }}>
              {type} ({typeResources.length})
            </div>
            {typeResources.map(res => {
              const assignedWPs = scheduledWps.filter(wp => wp.crew === res.name);
              const resBudgetHrs = assignedWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
              const resActualHrs = assignedWPs.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
              const resBurnPct = resBudgetHrs > 0 ? Math.round((resActualHrs / resBudgetHrs) * 100) : 0;
              const isOverBudget = resActualHrs > resBudgetHrs && resBudgetHrs > 0;
              const resBudgetFromEntity = effectiveCapacityById[res.id] || 0;
              const isOverAllocated = resBudgetFromEntity > 0 && resBudgetHrs > resBudgetFromEntity;
              const resSkills = extractSkillsRS(res);
              const memberCount = (membersByParentId[res.id] || []).length;
              const heatBg = getRowCapacityBg(resBurnPct, isOverAllocated);
              return (
                <div key={res.id} style={{
                  background: isOverAllocated ? "rgba(239,68,68,0.06)" : heatBg !== "transparent" ? heatBg : "var(--bg-surface-low)",
                  border: isOverAllocated ? "1px solid rgba(239,68,68,0.20)" : "1px solid var(--divider)",
                  borderRadius: 8, padding: 8, marginBottom: 8,
                  transition: "background 0.2s, border-color 0.2s",
                }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    {res.name}
                    {memberCount > 0 && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                        · {memberCount} MEMBER{memberCount === 1 ? "" : "S"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                    {res.role || "\u2014"}
                  </div>
                  {resSkills.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {resSkills.map((sk, si) => (
                        <span key={si} style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                          color: "var(--text-secondary)", background: "var(--hover-bg)",
                          border: "1px solid var(--bg-surface-high)", borderRadius: 8,
                          padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase",
                        }}>{sk}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, color: isOverBudget ? "var(--status-error)" : "var(--text-muted)", letterSpacing: "0.06em" }}>
                    {resBudgetHrs}h bud {"\u00B7"} {resActualHrs}h act {"\u00B7"} {resBurnPct}%
                  </div>
                  <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--border-default)", marginTop: 3 }}>
                    <div style={{ width: `${Math.min(100, resBurnPct)}%`, height: "100%", borderRadius: 2, background: resBurnPct > 100 ? "var(--status-error)" : resBurnPct > 80 ? "var(--status-warning)" : "var(--accent)", transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                    {assignedWPs.length} WPs {"\u00B7"} {assignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
                  </div>
                  {isOverAllocated && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em" }}>
                      {"\u26A0"} OVER-ALLOC ({resBudgetHrs}h / {resBudgetFromEntity}h cap)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <UnscheduledTray
        unscheduledWps={unscheduledWps}
        onPointerDown={onUnscheduledPointerDown}
        onOpenContextMenu={onOpenContextMenu}
      />
    </div>
  );
}

export function DragTooltipOverlay({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: tooltip.x,
        top: tooltip.y,
        transform: "translateX(-50%)",
        background: "var(--bg-surface-low)",
        border: "1px solid rgba(245,158,11,0.5)",
        borderRadius: 6,
        padding: "4px 12px",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        color: "var(--status-warning)",
        fontWeight: 700,
        pointerEvents: "none",
        zIndex: 10001,
        whiteSpace: "nowrap",
        boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
      }}
    >
      {tooltip.text}
      {tooltip.subText && (
        <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-secondary)", marginTop: 2, letterSpacing: "0.03em" }}>
          {tooltip.subText}
        </div>
      )}
    </div>
  );
}

export function HoverTooltipOverlay({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div style={{
      position: "fixed", left: tooltip.x, top: tooltip.y,
      transform: "translate(-50%, -100%)", background: "var(--bg-surface-low)",
      border: "1px solid rgba(var(--accent-rgb, 59,130,246),0.25)", borderRadius: 8,
      padding: "10px 14px", zIndex: 10001, pointerEvents: "none",
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200,
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
        {tooltip.wp.wp_number} — {tooltip.wp.name}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        Phase: {tooltip.wp.phase} {"\u00B7"} Status: {tooltip.wp.status}<br/>
        Tonnage: {tooltip.wp.tonnage || 0}T {"\u00B7"} Progress: {tooltip.wp.percent_complete || 0}%<br/>
        Shop: {tooltip.shopAct}h / {tooltip.shopBud}h {"\u00B7"} Field: {tooltip.fieldAct}h / {tooltip.fieldBud}h<br/>
        <span style={{ color: tooltip.totalAct > tooltip.totalBud ? "var(--status-error-bright)" : "var(--status-success-bright)", fontWeight: 700 }}>
          Total: {tooltip.totalAct}h / {tooltip.totalBud}h ({tooltip.totalBud > 0 ? Math.round((tooltip.totalAct / tooltip.totalBud) * 100) : 0}%)
        </span>
        {tooltip.totalBud > 0 && (
          <><br/><span style={{ color: "var(--accent)", fontWeight: 600 }}>{"\u2248"} {hoursToWorkdays(tooltip.totalBud)} workdays</span></>
        )}
      </div>
    </div>
  );
}

export function UndoToastBanner({ toast: undoToast }) {
  if (!undoToast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        background: "var(--bg-surface-low)",
        border: "1px solid rgba(0,214,143,0.30)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 11,
        fontFamily: "var(--font-body)",
        color: "var(--status-success)",
        zIndex: 9998,
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}
    >
      ✓ {undoToast.message}
    </div>
  );
}
