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

export default function ResourceList({ resources, onEdit, onDelete }) {
  if (resources.length === 0) {
    return null; // Empty state handled by parent
  }

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
        gap: "16px",
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
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
        const utilization = resource.budget_hours ? Math.round((resource.actual_hours / resource.budget_hours) * 100) : 0;
        const capacityBg = getCapacityBg(utilization, resource.availability_status);
        const capacityBorderColor = getCapacityBorder(utilization, resource.availability_status);
        const skills = extractSkills(resource);
        const durationHint = getDurationHint(resource.budget_hours);
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
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
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
            </div>

            {/* Column 2: Hours + duration hint */}
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Budget: <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{resource.budget_hours || 0}h</strong></div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Actual: <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: utilization > 100 ? "var(--status-error)" : "var(--text-primary)" }}>{resource.actual_hours || 0}h</strong></div>
              {resource.hourly_rate > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>${resource.hourly_rate}/hr</div>}
              {durationHint && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", marginTop: 3, letterSpacing: "0.02em" }}>
                  {durationHint}
                </div>
              )}
            </div>

            {/* Column 3: Utilization bar */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
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
                background: `${STATUS_COLORS[resource.availability_status]}15`,
                border: `1px solid ${STATUS_COLORS[resource.availability_status]}35`,
                borderRadius: "var(--radius-badge)",
                minHeight: 24,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: STATUS_COLORS[resource.availability_status],
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}>
                  {resource.availability_status}
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
