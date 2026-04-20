import React from "react";
import { wpBudgetHoursForResource } from "@/lib/wpHoursForResource";
import { hoursToWorkdays, WORKDAYS_PER_WEEK, HOURS_PER_WORKDAY } from "@/lib/workweek";

const STATUS_COLORS = {
  Available: "var(--status-success)",
  Allocated: "var(--status-info)",
  "Over-Allocated": "var(--status-error)",
  "On Leave": "var(--text-muted)",
};

// ── Capacity heatmap background helper ──
function getCapacityBg(utilization, status) {
  if (status === "Over-Allocated" || utilization > 100) {
    return "rgba(239,68,68,0.06)";
  }
  if (utilization > 80 || status === "Allocated") {
    return "rgba(245,158,11,0.04)";
  }
  if (status === "Available") {
    return "rgba(34,197,94,0.03)";
  }
  return "transparent";
}

function getCapacityBorder(utilization, status) {
  if (status === "Over-Allocated" || utilization > 100) {
    return "rgba(239,68,68,0.18)";
  }
  if (utilization > 80) {
    return "rgba(245,158,11,0.12)";
  }
  if (status === "Available") {
    return "rgba(34,197,94,0.10)";
  }
  return "var(--divider)";
}

// ── Skill tag parser: extract from role, notes, or resource_type ──
const KNOWN_SKILLS = ["CWI", "Fitter", "Rigger", "Welder", "Erector", "Detailer", "PE", "QC", "Foreman", "Crane Op", "Ironworker", "Painter"];

function extractSkills(resource) {
  const skills = [];
  const text = `${resource.role || ""} ${resource.notes || ""} ${resource.resource_type || ""}`.toUpperCase();
  KNOWN_SKILLS.forEach((skill) => {
    if (text.includes(skill.toUpperCase())) {
      skills.push(skill);
    }
  });
  // Also extract any comma-separated items from role that look like trades
  if (resource.role) {
    resource.role.split(/[,/]+/).forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.length > 1 && trimmed.length <= 12 && !skills.find((s) => s.toUpperCase() === trimmed.toUpperCase())) {
        skills.push(trimmed);
      }
    });
  }
  return skills.slice(0, 5); // limit to 5
}

// ── Duration hint: budget hours to approx workdays ──
// Uses the shared workweek helper so a 40h week reads as "1 week" on a
// 5-day shop and the math matches the timeline bars.
function getDurationHint(budgetHours) {
  if (!budgetHours || budgetHours <= 0) return null;
  const workdays = hoursToWorkdays(budgetHours, HOURS_PER_WORKDAY);
  if (workdays === 1) return `\u2248 1 workday (${HOURS_PER_WORKDAY}h)`;
  if (workdays < WORKDAYS_PER_WEEK) {
    return `\u2248 ${workdays} workdays @ ${HOURS_PER_WORKDAY}h/day`;
  }
  const weeks = workdays / WORKDAYS_PER_WEEK;
  const weeksLabel = Number.isInteger(weeks) ? `${weeks}` : weeks.toFixed(1);
  return `\u2248 ${workdays} workdays (${weeksLabel} wk @ ${WORKDAYS_PER_WEEK} days/wk)`;
}

export default function ResourceList({ resources, workPackages = [], onEdit, onDelete }) {
  if (resources.length === 0) {
    return null; // Empty state handled by parent
  }

  // Pre-group WPs by assigned crew name for O(1) lookup per row.
  const wpsByCrew = React.useMemo(() => {
    const map = {};
    for (const wp of workPackages || []) {
      const key = (wp.crew || "").trim();
      if (!key) continue;
      (map[key] = map[key] || []).push(wp);
    }
    return map;
  }, [workPackages]);

  // Member rollup for crews: crew id → direct members.
  const membersByParentId = React.useMemo(() => {
    const map = {};
    for (const r of resources || []) {
      if (r.parent_resource_id) {
        (map[r.parent_resource_id] = map[r.parent_resource_id] || []).push(r);
      }
    }
    return map;
  }, [resources]);

  // Effective capacity = own + sum of direct children. Drives utilization
  // on crew rows.
  const effectiveCapacityById = React.useMemo(() => {
    const map = {};
    for (const r of resources || []) map[r.id] = Number(r.capacity) || 0;
    for (const r of resources || []) {
      if (r.parent_resource_id && map[r.parent_resource_id] !== undefined) {
        map[r.parent_resource_id] += Number(r.capacity) || 0;
      }
    }
    return map;
  }, [resources]);

  // Effective actual hours on a crew = sum of members' actual hours +
  // own actual hours. Walk metadata.actual_hours || actual_hours per row.
  const effectiveActualById = React.useMemo(() => {
    const own = (r) => {
      const meta = typeof r.metadata === "object" && r.metadata !== null ? r.metadata : {};
      return Number(meta.actual_hours) || Number(r.actual_hours) || 0;
    };
    const map = {};
    for (const r of resources || []) map[r.id] = own(r);
    for (const r of resources || []) {
      if (r.parent_resource_id && map[r.parent_resource_id] !== undefined) {
        map[r.parent_resource_id] += own(r);
      }
    }
    return map;
  }, [resources]);

  // Top-level resources = ones with no parent, OR whose parent isn't in
  // the currently filtered list (so filter=Labor won't leave Ironworker
  // children orphaned and invisible when their Crew parent is filtered
  // out).
  const visibleIds = React.useMemo(() => new Set((resources || []).map(r => r.id)), [resources]);
  const topLevelResources = React.useMemo(
    () => (resources || []).filter(r => !r.parent_resource_id || !visibleIds.has(r.parent_resource_id)),
    [resources, visibleIds],
  );

  // Expand/collapse state per crew id.
  const [expandedCrews, setExpandedCrews] = React.useState(() => new Set());
  const toggleCrew = React.useCallback((id) => {
    setExpandedCrews(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Flat display list: each top-level row + optionally its members when
  // expanded. Members inherit a `isMember` flag for indentation.
  const displayList = React.useMemo(() => {
    const out = [];
    for (const r of topLevelResources) {
      const children = (membersByParentId[r.id] || []).filter(c => visibleIds.has(c.id));
      out.push({ resource: r, isMember: false, memberCount: children.length });
      if (expandedCrews.has(r.id)) {
        for (const c of children) out.push({ resource: c, isMember: true, memberCount: 0 });
      }
    }
    return out;
  }, [topLevelResources, membersByParentId, expandedCrews, visibleIds]);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
        gap: "16px",
        padding: "10px 16px",
        borderBottom: "1px solid var(--bg-surface-high)",
        background: "var(--bg-surface-low)",
      }}>
        {["Resource", "Hours", "Utilization", "Status", ""].map((h) => (
          <div key={h} style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--text-muted)",
          }}>{h}</div>
        ))}
      </div>

      {displayList.map((entry, idx) => {
        const resource = entry.resource;
        const isMember = entry.isMember;
        const memberCount = entry.memberCount;
        const isCrew = memberCount > 0;
        const crewExpanded = isCrew && expandedCrews.has(resource.id);

        // DB column mapping: capacity = budget_hours, cost_rate = hourly_rate,
        // availability = availability_status, metadata.actual_hours = actual_hours.
        // For crew rows, use the effective rollup (own + members). Member rows
        // (indented children) show their own individual numbers for reference.
        const ownBudget = Number(resource.capacity) || Number(resource.budget_hours) || 0;
        const meta = typeof resource.metadata === "object" && resource.metadata !== null ? resource.metadata : {};
        const ownActual = Number(meta.actual_hours) || Number(resource.actual_hours) || 0;
        const budgetHours = isMember ? ownBudget : (effectiveCapacityById[resource.id] ?? ownBudget);
        const actualHours = isMember ? ownActual : (effectiveActualById[resource.id] ?? ownActual);
        const hourlyRate = Number(resource.cost_rate) || Number(resource.hourly_rate) || 0;
        const status = resource.availability || resource.availability_status || "Available";

        const utilization = budgetHours ? Math.round((actualHours / budgetHours) * 100) : 0;
        const capacityBg = getCapacityBg(utilization, status);
        const capacityBorderColor = getCapacityBorder(utilization, status);
        const skills = extractSkills(resource);
        const durationHint = getDurationHint(budgetHours);

        // Assigned work packages. Crews match on their own name OR any of
        // their members' names — so a WP assigned to John Smith still
        // shows up on "Erection Crew B" when John is a member.
        const members = membersByParentId[resource.id] || [];
        const memberNames = members.map(m => (m.name || "").trim()).filter(Boolean);
        const assignedWPs = [
          ...(wpsByCrew[resource.name] || []),
          ...memberNames.flatMap(n => wpsByCrew[n] || []),
        ];
        const assignedCount = assignedWPs.length;
        // Phase-aware hour bucketing — a field crew shouldn't bear a WP's
        // shop hours and a shop crew shouldn't bear its field hours.
        const assignedHours = assignedWPs.reduce(
          (s, w) => s + wpBudgetHoursForResource(w),
          0,
        );
        const assignedTons = assignedWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
        const barColor = utilization > 100 ? "var(--status-error)" : utilization > 80 ? "var(--status-warning)" : "var(--accent)";

        return (
          <div
            key={resource.id}
            style={{
              padding: "14px 16px",
              paddingLeft: isMember ? "36px" : "16px",   // indent member rows
              borderBottom: idx < displayList.length - 1 ? `1px solid ${capacityBorderColor}` : "none",
              borderLeft: isMember ? "2px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "none",
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
              gap: "16px",
              alignItems: "center",
              background: isMember ? "color-mix(in srgb, var(--bg-surface-low) 60%, var(--bg-surface))" : capacityBg,
              minHeight: "var(--density-row-height)",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isMember ? "color-mix(in srgb, var(--bg-surface-low) 60%, var(--bg-surface))" : capacityBg; }}
          >
            {/* Column 1: Name + type + skills */}
            <div>
              <div
                style={{
                  fontSize: isMember ? 12 : 13,
                  fontWeight: isMember ? 500 : 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: isCrew ? "pointer" : "default",
                }}
                onClick={isCrew ? () => toggleCrew(resource.id) : undefined}
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
                {resource.name}
                {isCrew && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    color: "var(--accent)", letterSpacing: "0.08em", marginLeft: 4,
                  }}>
                    · {memberCount} MEMBER{memberCount === 1 ? "" : "S"}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.06em" }}>{resource.resource_type}</div>
              {resource.role && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>{resource.role}</div>}

              {/* Skill tag badges */}
              {skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {skills.map((skill, i) => (
                    <span
                      key={i}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        background: "var(--hover-bg)",
                        border: "1px solid var(--bg-surface-high)",
                        borderRadius: 10,
                        padding: "2px 7px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {/* Assigned work packages summary. Shown for every resource,
                  even when nothing is assigned, so the connection to the WP
                  workflow is always visible. */}
              <div style={{
                marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--divider)",
                fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em",
              }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  WPs ·{" "}
                </span>
                {assignedCount > 0 ? (
                  <>
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>{assignedCount}</span>
                    <span style={{ color: "var(--text-muted)" }}> assigned · </span>
                    <span style={{ color: "var(--text-primary)" }}>{assignedHours}h</span>
                    {assignedTons > 0 && (
                      <span style={{ color: "var(--text-muted)" }}> · {assignedTons}T</span>
                    )}
                    {memberNames.length > 0 && (
                      <span style={{ color: "var(--text-muted)" }}> (incl. members)</span>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {assignedWPs.slice(0, 4).map(wp => (
                        <span key={wp.id} style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                          color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                          borderRadius: 3, padding: "2px 6px", letterSpacing: "0.04em",
                          whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {wp.wp_number ? `${wp.wp_number} · ` : ""}{wp.name || "WP"}
                        </span>
                      ))}
                      {assignedWPs.length > 4 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                          +{assignedWPs.length - 4} more
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    None assigned — set a WP's crew to "{resource.name}" on the Work Packages or Crew Scheduling page.
                  </span>
                )}
              </div>
            </div>

            {/* Column 2: Hours + duration hint */}
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Budget: <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{budgetHours}h</strong></div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Actual: <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: utilization > 100 ? "var(--status-error)" : "var(--text-primary)" }}>{actualHours}h</strong></div>
              {hourlyRate > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>${hourlyRate}/hr</div>}
              {durationHint && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", marginTop: 3, letterSpacing: "0.02em" }}>
                  {durationHint}
                </div>
              )}
            </div>

            {/* Column 3: Utilization bar */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 5, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    background: barColor,
                    width: `${Math.min(100, utilization)}%`,
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: utilization > 100 ? "var(--status-error)" : utilization > 80 ? "var(--status-warning)" : "var(--text-secondary)",
                  minWidth: 32,
                  textAlign: "right",
                }}>
                  {utilization}%
                </span>
              </div>
            </div>

            {/* Column 4: Status badge */}
            <div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                background: `${STATUS_COLORS[status] || "var(--text-muted)"}15`,
                border: `1px solid ${STATUS_COLORS[status] || "var(--text-muted)"}35`,
                borderRadius: "var(--radius-badge)",
                minHeight: 24,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: STATUS_COLORS[status] || "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}>
                  {status}
                </span>
              </div>
              {resource.notes && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resource.notes}
                </div>
              )}
            </div>

            {/* Column 5: Actions */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {onEdit && (
                <button
                  onClick={() => onEdit(resource)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-badge)",
                    padding: "4px 10px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    minHeight: 28,
                    minWidth: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(resource)}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: "var(--radius-badge)",
                    padding: "4px 8px",
                    color: "var(--status-error)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 28,
                    minWidth: 28,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  &#10005;
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
