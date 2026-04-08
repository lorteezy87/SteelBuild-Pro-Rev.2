import React from "react";

const TYPE_COLORS = {
  Scope: "var(--status-success)",
  Exclusion: "var(--status-error)",
  Clarification: "var(--status-info)",
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

export default function ScopeItemList({ items, onEdit, onDelete }) {
  if (items.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No scope items
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "16px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "8px",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "4px",
                }}
              >
                {item.description.substring(0, 100)}
                {item.description.length > 100 ? "..." : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "12px" }}>
              {/* Action Buttons */}
              {onEdit && (
                <button onClick={() => onEdit(item)} style={{ background: "transparent", border: "1px solid var(--border-default)", borderRadius: 4, padding: "3px 8px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>EDIT</button>
              )}
              {onDelete && (
                <button onClick={() => onDelete(item)} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "3px 7px", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer" }}>✕</button>
              )}
              {/* Type Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: `${TYPE_COLORS[item.item_type]}20`,
                  border: `1px solid ${TYPE_COLORS[item.item_type]}40`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: TYPE_COLORS[item.item_type],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {item.item_type}
                </span>
              </div>

              {/* Category Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: `${CATEGORY_COLORS[item.category]}20`,
                  border: `1px solid ${CATEGORY_COLORS[item.category]}40`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: CATEGORY_COLORS[item.category],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {item.category}
                </span>
              </div>
            </div>
          </div>

          {/* Full Description */}
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--divider)" }}>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {item.description}
            </p>
          </div>

          {/* Footer */}
          {(item.added_by || item.notes) && (
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid var(--divider)",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
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
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
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
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                    {item.notes}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}