import React from "react";
import { Check, X, Info, FileText, Plus, Filter } from "lucide-react";

const TYPE_META = {
  Scope:         { color: "var(--status-success)", Icon: Check },
  Exclusion:     { color: "var(--status-error)",   Icon: X },
  Clarification: { color: "var(--status-info)",    Icon: Info },
};

const CATEGORY_COLORS = {
  Structural: "var(--accent)",
  "Misc Metals": "var(--status-warning)",
  Connections: "var(--status-info)",
  Coatings: "var(--text-muted)",
  Erection: "var(--status-success)",
  Engineering: "var(--accent)",
  Other: "var(--text-muted)",
};

export default function ScopeItemList({
  items,
  totalCount = 0,
  hasActiveFilters = false,
  onCreateFirst,
  onClearFilters,
  onEdit,
  onDelete,
  onToggleComplete,
}) {
  if (items.length === 0) {
    // Two empty states: no data at all, vs filters hiding everything
    const isFilteredEmpty = totalCount > 0 && hasActiveFilters;

    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-default)",
          borderRadius: "12px",
          padding: "56px 24px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--bg-surface-low, rgba(255,255,255,0.03))",
            border: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isFilteredEmpty ? "var(--status-info)" : "var(--accent)",
          }}
        >
          {isFilteredEmpty ? <Filter size={26} strokeWidth={2} /> : <FileText size={26} strokeWidth={2} />}
        </div>

        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {isFilteredEmpty ? "No items match your filters" : "No scope items yet"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-secondary)",
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            {isFilteredEmpty
              ? "Try clearing a filter or adjusting your search to see more results."
              : "Track what's included, excluded, or clarified in the project contract. Start by adding your first scope item."}
          </div>
        </div>

        {isFilteredEmpty ? (
          <button
            onClick={onClearFilters}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: "10px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Clear Filters
          </button>
        ) : (
          onCreateFirst && (
            <button
              onClick={onCreateFirst}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              <Plus size={12} strokeWidth={3} /> Add your first Scope Item
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {items.map((item) => {
        const typeMeta = TYPE_META[item.item_type] || { color: "var(--text-muted)", Icon: FileText };
        const TypeIcon = typeMeta.Icon;
        const categoryColor = CATEGORY_COLORS[item.category] || "var(--text-muted)";
        const isComplete = !!item.is_completed;
        return (
          <div
            key={item.id}
            style={{
              background: isComplete ? "var(--bg-surface-low, rgba(255,255,255,0.02))" : "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderLeft: `3px solid ${isComplete ? "var(--status-success)" : typeMeta.color}`,
              borderRadius: "12px",
              padding: "14px 16px",
              transition: "all 0.15s",
              opacity: isComplete ? 0.65 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-border)";
              e.currentTarget.style.borderLeftColor = isComplete ? "var(--status-success)" : typeMeta.color;
              e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.borderLeftColor = isComplete ? "var(--status-success)" : typeMeta.color;
              e.currentTarget.style.background = isComplete ? "var(--bg-surface-low, rgba(255,255,255,0.02))" : "var(--bg-surface)";
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: "8px",
              }}
            >
              {/* Checkbox */}
              {onToggleComplete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleComplete(item); }}
                  aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
                  title={isComplete ? "Mark incomplete" : "Mark complete"}
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: `2px solid ${isComplete ? "var(--status-success)" : "var(--border-default)"}`,
                    background: isComplete ? "var(--status-success)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    marginTop: 1,
                    transition: "all 0.15s",
                    padding: 0,
                  }}
                >
                  {isComplete && <Check size={14} strokeWidth={3.5} color="#fff" />}
                </button>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: isComplete ? "var(--text-muted)" : "var(--text-primary)",
                    marginBottom: "4px",
                    lineHeight: 1.4,
                    textDecoration: isComplete ? "line-through" : "none",
                    textDecorationColor: "var(--status-success)",
                    textDecorationThickness: "1.5px",
                  }}
                >
                  {item.description}
                </div>
                {isComplete && item.completed_at && (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--status-success)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    ✓ Completed {new Date(item.completed_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                {/* Type Badge (with icon) */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    background: `${typeMeta.color}20`,
                    border: `1px solid ${typeMeta.color}40`,
                    borderRadius: "6px",
                    color: typeMeta.color,
                  }}
                >
                  <TypeIcon size={10} strokeWidth={3} />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {item.item_type}
                  </span>
                </div>

                {/* Category Badge */}
                {item.category && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      background: `${categoryColor}20`,
                      border: `1px solid ${categoryColor}40`,
                      borderRadius: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        color: categoryColor,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                )}

                {/* Action Buttons */}
                {onEdit && (
                  <button
                    onClick={() => onEdit(item)}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-default)",
                      borderRadius: 4,
                      padding: "3px 8px",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(item)}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 4,
                      padding: "3px 7px",
                      color: "var(--status-error)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                    aria-label="Delete"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            {(item.added_by || item.notes) && (
              <div
                style={{
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--divider)",
                  display: "grid",
                  gridTemplateColumns: item.added_by && item.notes ? "auto 1fr" : "1fr",
                  gap: "16px",
                }}
              >
                {item.added_by && (
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: "2px",
                      }}
                    >
                      Added By
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {item.added_by}
                    </div>
                  </div>
                )}

                {item.notes && (
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: "2px",
                      }}
                    >
                      Notes
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {item.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
