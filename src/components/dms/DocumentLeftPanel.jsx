import React from "react";

export default function DocumentLeftPanel({ documents, activeFilters, onFilterChange }) {
  const categories = [
    "Blueprint", "Shop Drawing", "IFC Model", "RFI Document",
    "Submittal", "Specification", "Contract", "Change Order",
    "Daily Log", "Photo", "Report", "Transmittal",
    "Material Cert", "Safety", "Other"
  ];

  const disciplines = ["Structural", "Arch", "MEP", "Civil", "Misc Metals", "Geotechnical", "Other"];
  const statuses = ["Approved", "Under Review", "Draft", "Superseded"];

  const getCategoryCount = (cat) => documents.filter((d) => d.category === cat).length;
  const getDisciplineCount = (disc) => documents.filter((d) => d.discipline === disc).length;
  const getStatusCount = (stat) => documents.filter((d) => d.status === stat).length;
  const getLinkedCount = (type) => {
    const field =
      type === "WP" ? "linkedWorkPackages" :
      type === "DEL" ? "linkedDeliveries" :
      type === "RFI" ? "linkedRFIs" :
      type === "SUB" ? "linkedSubmittals" : null;
    if (!field) return 0;
    return documents.filter((d) => d[field]?.length > 0).length;
  };

  const toggleFilter = (key, value) => {
    const current = activeFilters[key] || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange(key, updated.length > 0 ? updated : null);
  };

  const renderCategory = (cat) => {
    const count = getCategoryCount(cat);
    const active = activeFilters.category?.includes(cat);
    return (
      <button
        key={cat}
        onClick={() => toggleFilter("category", cat)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          background: active ? "var(--accent-muted)" : "transparent",
          border: "none",
          borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          cursor: "pointer",
          borderRadius: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          transition: "all 0.15s"
        }}
      >
        <span>{cat}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(160,175,210,0.50)" }}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div style={{ width: 240, overflowY: "auto", paddingRight: 8 }}>
      {/* All Documents */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          Repository
        </div>
        <div
          style={{
            padding: "8px 12px",
            background: "var(--accent-muted)",
            borderLeft: "2px solid var(--accent)",
            borderRadius: 4,
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--accent)",
            fontWeight: 600
          }}
        >
          All Documents <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 4 }}>({documents.length})</span>
        </div>
      </div>

      {/* Category divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />

      {/* Categories */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          Categories
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {categories.map(renderCategory)}
        </div>
      </div>

      {/* Discipline divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />

      {/* Disciplines */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          Disciplines
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {disciplines.map((disc) => {
            const count = getDisciplineCount(disc);
            const active = activeFilters.discipline?.includes(disc);
            return (
              <button
                key={disc}
                onClick={() => toggleFilter("discipline", disc)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: active ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                  color: active ? "var(--accent)" : "rgba(220,225,240,0.70)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                  }}
                  >
                  <span>{disc}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />

      {/* Status */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          Status
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {statuses.map((stat) => {
            const count = getStatusCount(stat);
            const active = activeFilters.status?.includes(stat);
            return (
              <button
                key={stat}
                onClick={() => toggleFilter("status", stat)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: active ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                  color: active ? "var(--accent)" : "rgba(220,225,240,0.70)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                  }}
                  >
                  <span>● {stat}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Linked divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />

      {/* Linked to */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          Linked To
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            { label: "Work Packages", type: "WP" },
            { label: "Deliveries", type: "DEL" },
            { label: "RFIs", type: "RFI" },
            { label: "Submittals", type: "SUB" }
          ].map((item) => (
            <div
              key={item.type}
              style={{
                padding: "6px 10px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 4,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                justifyContent: "space-between"
              }}
            >
              <span>{item.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                {getLinkedCount(item.type)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}