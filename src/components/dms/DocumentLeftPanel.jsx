import React from "react";

const STATUS_DOT_COLORS = {
  "Draft":                   "#94a3b8",
  "Under Review":            "#eab308",
  "Approved":                "#22c55e",
  "Approved with Comments":  "#4ade80",
  "Revise & Resubmit":       "#f97316",
  "Rejected":                "#ef4444",
  "Issued":                  "#3b82f6",
  "Superseded":              "#64748b",
  "Archived":                "#475569",
  "Void":                    "#dc2626",
};

export default function DocumentLeftPanel({ documents = [], filteredCount, activeFilters = {}, onFilterChange }) {
  const categories = [
    "Blueprint", "Shop Drawing", "IFC Model", "Specification",
    "Submittal", "Transmittal", "RFI Response", "Change Order",
    "Contract", "Photo", "Report", "Correspondence",
    "Permit", "Inspection Report", "Other",
  ];

  const disciplines = ["Structural", "Architectural", "MEP", "Civil", "Misc Metals", "Geotechnical", "General", "Other"];
  const statuses = ["Draft", "Under Review", "Approved", "Approved with Comments", "Revise & Resubmit", "Rejected", "Issued", "Superseded", "Archived", "Void"];

  const getCategoryCount   = (cat)  => documents.filter(d => d.category === cat).length;
  const getDisciplineCount = (disc) => documents.filter(d => d.discipline === disc).length;
  const getStatusCount     = (stat) => documents.filter(d => d.status === stat).length;

  const getLinkedCount = (type) => {
    const field =
      type === "WP"  ? "work_package_id" :
      type === "DEL" ? "delivery_id" :
      type === "RFI" ? "rfi_id" :
      type === "SUB" ? "submittal_id" : null;
    if (!field) return 0;
    return documents.filter(d => d[field]).length;
  };

  const toggleFilter = (key, value) => {
    const current = activeFilters[key] || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFilterChange(key, updated.length > 0 ? updated : null);
  };

  const renderFilterItem = (label, key, value, count, dotColor) => {
    const active = activeFilters[key]?.includes(value);
    return (
      <button
        key={value}
        onClick={() => toggleFilter(key, value)}
        style={{
          width: "100%", textAlign: "left", padding: "6px 10px",
          background: active ? "var(--accent-muted)" : "transparent",
          border: "none",
          borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          fontFamily: "var(--font-body)", fontSize: 12,
          cursor: "pointer", borderRadius: 4,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          transition: "all 0.15s",
          opacity: count === 0 ? 0.45 : 1,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {dotColor && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: dotColor, flexShrink: 0,
            }} />
          )}
          {label}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: active ? "var(--accent)" : "rgba(160,175,210,0.50)",
          minWidth: 18, textAlign: "right",
        }}>
          {count}
        </span>
      </button>
    );
  };

  const sectionTitle = (text) => (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
      letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase", fontWeight: 600,
    }}>
      {text}
    </div>
  );

  const divider = <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />;

  return (
    <div style={{ width: 240, overflowY: "auto", paddingRight: 8 }}>
      {/* All Documents */}
      <div style={{ marginBottom: 16 }}>
        {sectionTitle("Repository")}
        <div style={{
          padding: "8px 12px", background: "var(--accent-muted)",
          borderLeft: "2px solid var(--accent)", borderRadius: 4,
          fontFamily: "var(--font-body)", fontSize: 13, color: "var(--accent)", fontWeight: 600,
        }}>
          All Documents <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 4 }}>
            ({documents.length})
          </span>
          {filteredCount != null && filteredCount !== documents.length && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: 6 }}>
              {filteredCount} shown
            </span>
          )}
        </div>
      </div>

      {divider}

      {/* Categories */}
      <div style={{ marginBottom: 16 }}>
        {sectionTitle("Categories")}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {categories.map(cat =>
            renderFilterItem(cat, "category", cat, getCategoryCount(cat))
          )}
        </div>
      </div>

      {divider}

      {/* Disciplines */}
      <div style={{ marginBottom: 16 }}>
        {sectionTitle("Disciplines")}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {disciplines.map(disc =>
            renderFilterItem(disc, "discipline", disc, getDisciplineCount(disc))
          )}
        </div>
      </div>

      {divider}

      {/* Status — with color dots */}
      <div style={{ marginBottom: 16 }}>
        {sectionTitle("Status")}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {statuses.map(stat =>
            renderFilterItem(stat, "status", stat, getStatusCount(stat), STATUS_DOT_COLORS[stat])
          )}
        </div>
      </div>

      {divider}

      {/* Linked To */}
      <div>
        {sectionTitle("Linked To")}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            { label: "Work Packages", type: "WP",  color: "#8b5cf6" },
            { label: "Deliveries",    type: "DEL", color: "#0891b2" },
            { label: "RFIs",          type: "RFI", color: "#f97316" },
            { label: "Submittals",    type: "SUB", color: "#eab308" },
          ].map(item => {
            const count = getLinkedCount(item.type);
            return (
              <div
                key={item.type}
                style={{
                  padding: "6px 10px", background: "rgba(255,255,255,0.02)",
                  borderRadius: 4, fontFamily: "var(--font-body)", fontSize: 12,
                  color: count > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  opacity: count === 0 ? 0.5 : 1,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                  {item.label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(160,175,210,0.50)" }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
