import React from "react";

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

// ── Duration hint: budget hours to approx days ──
function getDurationHint(budgetHours) {
  if (!budgetHours || budgetHours <= 0) return null;
  const days = Math.ceil(budgetHours / 8);
  if (days === 1) return "\u2248 1 day at 8h/day";
  return `\u2248 ${days} days at 8h/day`;
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

      {resources.map((resource, idx) => {
        // DB column mapping: capacity = budget_hours, cost_rate = hourly_rate,
        // availability = availability_status, metadata.actual_hours = actual_hours
        const budgetHours = Number(resource.capacity) || Number(resource.budget_hours) || 0;
        const meta = typeof resource.metadata === "object" && resource.metadata !== null ? resource.metadata : {};
        const actualHours = Number(meta.actual_hours) || Number(resource.actual_hours) || 0;
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
        const assignedHours = assignedWPs.reduce(
          (s, w) => s + (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0),
          0,
        );
        const assignedTons = assignedWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
        const barColor = utilization > 100 ? "var(--status-error)" : utilization > 80 ? "var(--status-warning)" : "var(--accent)";

        return (
          <div
            key={resource.id}
            style={{
              padding: "14px 16px",
              borderBottom: idx < resources.length - 1 ? `1px solid ${capacityBorderColor}` : "none",
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
              gap: "16px",
              alignItems: "center",
              background: capacityBg,
              minHeight: "var(--density-row-height)",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = capacityBg; }}
          >
            {/* Column 1: Name + type + skills */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>{resource.name}</div>
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
