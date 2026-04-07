import React, { useState } from "react";

export default function DocumentFilters({ onFilterChange, activeFilters, onClearAll }) {
  const [open, setOpen] = useState(false);

  const CATEGORIES = [
    "Blueprint", "Shop Drawing", "IFC Model", "Specification",
    "Submittal", "Transmittal", "RFI Response", "Change Order",
    "Contract", "Photo", "Report", "Correspondence",
    "Permit", "Inspection Report", "Other"
  ];

  const DISCIPLINES = ["Structural", "Architectural", "MEP", "Civil", "Misc Metals", "Geotechnical", "General", "Other"];
  const STATUSES = ["Draft", "Under Review", "Approved", "Approved with Comments", "Revise & Resubmit", "Rejected", "Issued", "Superseded", "Archived", "Void"];

  const removeFilter = (key, value) => {
    const updated = activeFilters[key]
      ? activeFilters[key].filter((v) => v !== value)
      : [];
    onFilterChange(key, updated.length > 0 ? updated : null);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            padding: "6px 12px",
            background: open ? "var(--accent-muted)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${open ? "var(--accent-border)" : "rgba(255,255,255,0.12)"}`,
            color: open ? "var(--accent)" : "var(--text-secondary)",
            borderRadius: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s"
          }}
        >
          FILTER ▾
        </button>

        {Object.keys(activeFilters).some((k) => activeFilters[k]?.length > 0) && (
          <button
            onClick={onClearAll}
            style={{
              padding: "4px 8px",
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            CLEAR ALL
          </button>
        )}
      </div>

      {/* Active filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.keys(activeFilters).map((key) =>
          activeFilters[key]?.map((value) => (
            <div
              key={`${key}-${value}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "var(--accent-muted)",
                border: "1px solid var(--accent-border)",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--accent)"
              }}
            >
              <span>{value}</span>
              <button
                onClick={() => removeFilter(key, value)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Filter panel */}
      {open && (
        <div
          style={{
            background: "var(--bg-surface-mid)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16
          }}
        >
          {/* Categories */}
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                marginBottom: 8,
                textTransform: "uppercase"
              }}
            >
              Category
            </div>
            {CATEGORIES.map((cat) => (
              <label
                key={cat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 0",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)"
                }}
              >
                <input
                  type="checkbox"
                  checked={activeFilters.category?.includes(cat) || false}
                  onChange={(e) => {
                    const updated = activeFilters.category || [];
                    if (e.target.checked) {
                      onFilterChange("category", [...updated, cat]);
                    } else {
                      onFilterChange("category", updated.filter((v) => v !== cat));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
                {cat}
              </label>
            ))}
          </div>

          {/* Disciplines & Status */}
          <div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                  textTransform: "uppercase"
                }}
              >
                Discipline
              </div>
              {DISCIPLINES.map((disc) => (
                <label
                  key={disc}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-secondary)"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={activeFilters.discipline?.includes(disc) || false}
                    onChange={(e) => {
                      const updated = activeFilters.discipline || [];
                      if (e.target.checked) {
                        onFilterChange("discipline", [...updated, disc]);
                      } else {
                        onFilterChange("discipline", updated.filter((v) => v !== disc));
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  {disc}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                  textTransform: "uppercase"
                }}
              >
                Status
              </div>
              {STATUSES.map((status) => (
                <label
                  key={status}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-secondary)"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={activeFilters.status?.includes(status) || false}
                    onChange={(e) => {
                      const updated = activeFilters.status || [];
                      if (e.target.checked) {
                        onFilterChange("status", [...updated, status]);
                      } else {
                        onFilterChange("status", updated.filter((v) => v !== status));
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  {status}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}