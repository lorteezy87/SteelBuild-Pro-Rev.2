import React from "react";

const STATUS_COLORS = {
  Available: "var(--status-success)",
  Allocated: "var(--status-info)",
  "Over-Allocated": "var(--status-error)",
  "On Leave": "var(--text-muted)",
};

export default function ResourceList({ resources, onCreate }) {
  if (resources.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>No resources</p>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Create Resource
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", overflow: "hidden" }}>
      {resources.map((resource, idx) => {
        const utilization = resource.budget_hours ? Math.round((resource.actual_hours / resource.budget_hours) * 100) : 0;
        return (
          <div key={resource.id} style={{ padding: "14px 16px", borderBottom: idx < resources.length - 1 ? "1px solid var(--divider)" : "none", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "16px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{resource.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{resource.resource_type}</div>
              {resource.role && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{resource.role}</div>}
            </div>

            <div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Budget: <strong>{resource.budget_hours || 0}h</strong></div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Actual: <strong>{resource.actual_hours || 0}h</strong></div>
              {resource.hourly_rate && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>${resource.hourly_rate}/hr</div>}
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <div style={{ flex: 1, height: "4px", background: "var(--border-default)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--accent)", width: `${Math.min(100, utilization)}%` }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", minWidth: "25px" }}>{utilization}%</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 6px", background: `${STATUS_COLORS[resource.availability_status]}20`, border: `1px solid ${STATUS_COLORS[resource.availability_status]}40`, borderRadius: "4px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", fontWeight: 600, color: STATUS_COLORS[resource.availability_status], textTransform: "uppercase", letterSpacing: "0.05em" }}>{resource.availability_status}</span>
              </div>
            </div>

            {resource.notes && (
              <div style={{ fontSize: "9px", color: "var(--text-secondary)", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resource.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
