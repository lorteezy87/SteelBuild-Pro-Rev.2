import React from "react";
import WorkPackageBar from "./WorkPackageBar";
import { TODAY_COLOR, extractSkillsRS, getRowCapacityBg } from "./utils";
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";

/**
 * One row on the scheduling board. Renders:
 *   - left label column (name + skill tags + load stats + over-alloc chip)
 *   - right timeline area with all WP bars assigned to this resource,
 *     plus the Today line.
 *
 * Member rows are indented and slightly styled-down (smaller font, lighter
 * background) so they read as sub-rows beneath their crew parent.
 *
 * All state is lifted — the row doesn't know about drag refs or the
 * context menu; it just fires callbacks when bars are interacted with.
 */
export default function ResourceRow({
  entry,
  idx,
  scheduledWps,
  effectiveCapacityById,
  expandedCrews,
  onToggleCrew,
  getBarStyle,
  todayOffset,
  onBarPointerDown,
  onOpenContextMenu,
  onBarHoverEnter,
  onBarHoverLeave,
}) {
  const resource = entry.resource;
  const rowAssignedWPs = scheduledWps.filter(wp => wp.crew === resource.name);
  const rowBudgetHrs = rowAssignedWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
  const rowActualHrs = rowAssignedWPs.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
  const rowBurnPct = rowBudgetHrs > 0 ? Math.round((rowActualHrs / rowBudgetHrs) * 100) : 0;
  const rowIsOverBudget = rowActualHrs > rowBudgetHrs && rowBudgetHrs > 0;
  // Crew rows use effective capacity (own + members); member rows show
  // their own individual capacity for reference.
  const resBudgetFromEntity = entry.isMember
    ? (Number(resource.capacity) || 0)
    : (effectiveCapacityById[resource.id] || 0);
  const isOverAllocated = resBudgetFromEntity > 0 && rowBudgetHrs > resBudgetFromEntity;
  const isEquipment = resource.resource_type === "Equipment";
  const rowHeatBg = getRowCapacityBg(rowBurnPct, isOverAllocated);
  const rowSkills = extractSkillsRS(resource);
  const isCrew = entry.hasMembers;
  const crewExpanded = isCrew && expandedCrews.has(resource.id);

  return (
    <div
      data-resource-id={resource.id}
      data-resource-name={resource.name}
      style={{
        display: "flex",
        background: isOverAllocated
          ? "rgba(239,68,68,0.04)"
          : rowHeatBg !== "transparent"
            ? rowHeatBg
            : (idx % 2 === 0 ? "var(--bg-page)" : "var(--bg-surface-low)"),
        borderBottom: "1px solid var(--border-default)",
        minHeight: 60,
        transition: "background 0.2s",
      }}
    >
      {/* Left label */}
      <div
        style={{
          width: 220,
          padding: "8px 12px",
          paddingLeft: entry.isMember ? 28 : 12,
          flexShrink: 0,
          // Member sub-rows used bg-sidebar which is dark navy in light
          // mode — made the resource-name column a solid blue stripe.
          // bg-surface-mid reads as a subtle nested band in both themes.
          background: entry.isMember ? "var(--bg-surface-mid)" : "var(--bg-page)",
          borderRight: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ width: "100%" }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: entry.isMember ? 12 : 13,
              color: "var(--text-primary)",
              fontWeight: entry.isMember ? 500 : 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: isCrew ? "pointer" : "default",
            }}
            onClick={isCrew ? () => onToggleCrew(resource.id) : undefined}
            title={isCrew ? (crewExpanded ? "Collapse crew members" : "Expand crew members") : undefined}
          >
            {isCrew && (
              <span style={{
                fontSize: 10, color: "var(--accent)",
                display: "inline-block",
                transform: crewExpanded ? "rotate(90deg)" : "none",
                transition: "transform 150ms",
              }}>▶</span>
            )}
            {isEquipment ? "\u2699 " : ""}{resource.name}
            {isCrew && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                color: "var(--accent)", letterSpacing: "0.08em", marginLeft: "auto",
              }}>
                {entry.memberCount} MEMBER{entry.memberCount === 1 ? "" : "S"}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
            {resource.role || "\u2014"}
          </div>

          {/* Skill tags */}
          {rowSkills.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
              {rowSkills.map((sk, si) => (
                <span key={si} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                  color: "var(--text-secondary)", background: "var(--hover-bg)",
                  border: "1px solid var(--bg-surface-high)", borderRadius: 8,
                  padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase",
                }}>{sk}</span>
              ))}
            </div>
          )}

          {rowBudgetHrs > 0 && (
            <>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4,
                color: rowIsOverBudget ? "var(--status-error)" : "var(--text-muted)",
                letterSpacing: "0.06em",
              }}>
                {rowBudgetHrs}h bud {"\u00B7"} {rowActualHrs}h act {"\u00B7"} {rowBurnPct}%
              </div>
              <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--border-default)", marginTop: 3 }}>
                <div style={{
                  width: `${Math.min(100, rowBurnPct)}%`,
                  height: "100%", borderRadius: 2,
                  background: rowBurnPct > 100 ? "var(--status-error)" : rowBurnPct > 80 ? "var(--status-warning)" : "var(--accent)",
                  transition: "width 0.4s",
                }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                {rowAssignedWPs.length} WPs {"\u00B7"} {rowAssignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
              </div>
            </>
          )}

          {isOverAllocated && (
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)",
              background: "var(--danger-muted)", border: "1px solid var(--danger-border)",
              borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em",
            }}>
              {"\u26A0"} OVER-ALLOC
            </div>
          )}
        </div>
      </div>

      {/* Timeline bars */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {scheduledWps
          .filter(wp => wp.crew === resource.name)
          .map(wp => {
            const pos = getBarStyle(wp);
            if (!pos) return null;
            return (
              <WorkPackageBar
                key={wp.id}
                wp={wp}
                pos={pos}
                resourceId={resource.id}
                resourceName={resource.name}
                onPointerDown={onBarPointerDown}
                onContextMenu={onOpenContextMenu}
                onMouseEnter={onBarHoverEnter}
                onMouseLeave={onBarHoverLeave}
              />
            );
          })}

        {/* Today line */}
        <div
          style={{
            position: "absolute",
            left: `${todayOffset}px`,
            top: 0,
            bottom: 0,
            width: 2,
            background: TODAY_COLOR,
            boxShadow: "0 0 10px rgba(255,107,0,0.6), 0 0 20px rgba(255,107,0,0.2)",
            zIndex: 20,
            pointerEvents: "none",
            animation: "rsTodayPulse 3s ease-in-out infinite",
          }}
        >
          <div style={{
            position: "absolute",
            top: -1, left: "50%", transform: "translateX(-50%)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            color: "#fff", background: TODAY_COLOR,
            borderRadius: 3, padding: "1px 5px", letterSpacing: "0.08em",
            whiteSpace: "nowrap", lineHeight: 1.4,
          }}>
            TODAY
          </div>
        </div>
      </div>
    </div>
  );
}
