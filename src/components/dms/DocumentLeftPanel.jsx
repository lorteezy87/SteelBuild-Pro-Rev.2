import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

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

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          cursor: "pointer", userSelect: "none", marginBottom: open ? 8 : 0,
        }}
      >
        <ChevronDown
          size={12}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
          letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
        }}>
          {title}
        </span>
      </div>
      {open && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 2,
          animation: "fadeInSection 0.15s ease-out",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

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
    /* Hide items with 0 count (unless actively filtered) */
    const active = activeFilters[key]?.includes(value);
    if (count === 0 && !active) return null;

    const hasDocuments = count > 0;
    return (
      <button
        key={value}
        onClick={() => toggleFilter(key, value)}
        style={{
          width: "100%", textAlign: "left", padding: "6px 10px",
          background: active ? "var(--accent-muted)" : "transparent",
          border: "none",
          borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
          color: active ? "var(--accent)" : hasDocuments ? "var(--text-secondary)" : "var(--text-muted)",
          fontFamily: "var(--font-body)", fontSize: 12,
          cursor: "pointer", borderRadius: 4,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          transition: "all 0.15s",
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
          color: active ? "var(--accent)" : hasDocuments ? "var(--text-secondary)" : "var(--text-muted)",
          fontWeight: hasDocuments ? 700 : 400,
          minWidth: 18, textAlign: "right",
        }}>
          {count}
        </span>
      </button>
    );
  };

  const divider = <div style={{ height: 1, background: "var(--hover-bg)", margin: "12px 0" }} />;

  return (
    <div style={{ width: 240, overflowY: "auto", paddingRight: 8 }}>
      {/* All Documents */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
          letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase", fontWeight: 600,
        }}>
          Repository
        </div>
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

      {/* Categories — collapsible, hides 0-count */}
      <CollapsibleSection title="Categories">
        {categories.map(cat =>
          renderFilterItem(cat, "category", cat, getCategoryCount(cat))
        )}
      </CollapsibleSection>

      {divider}

      {/* Disciplines — collapsible, hides 0-count */}
      <CollapsibleSection title="Disciplines">
        {disciplines.map(disc =>
          renderFilterItem(disc, "discipline", disc, getDisciplineCount(disc))
        )}
      </CollapsibleSection>

      {divider}

      {/* Status — collapsible, with color dots, hides 0-count */}
      <CollapsibleSection title="Status">
        {statuses.map(stat =>
          renderFilterItem(stat, "status", stat, getStatusCount(stat), STATUS_DOT_COLORS[stat])
        )}
      </CollapsibleSection>

      {divider}

      {/* Linked To */}
      <CollapsibleSection title="Linked To">
        {[
          { label: "Work Packages", type: "WP",  color: "#8b5cf6" },
          { label: "Deliveries",    type: "DEL", color: "#0891b2" },
          { label: "RFIs",          type: "RFI", color: "#f97316" },
          { label: "Submittals",    type: "SUB", color: "#eab308" },
        ].map(item => {
          const count = getLinkedCount(item.type);
          if (count === 0) return null;
          return (
            <div
              key={item.type}
              style={{
                padding: "6px 10px", background: "var(--hover-bg)",
                borderRadius: 4, fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                {item.label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", fontWeight: 700 }}>
                {count}
              </span>
            </div>
          );
        })}
      </CollapsibleSection>

      <style>{`
        @keyframes fadeInSection { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
