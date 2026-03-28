import React from "react";

const CATEGORY_COLORS = {
  General: "var(--text-muted)",
  Safety: "var(--status-error)",
  Quality: "var(--status-warning)",
  Schedule: "var(--status-info)",
  Fabrication: "var(--accent)",
  Erection: "var(--status-success)",
};

export default function ProductionNoteList({ notes, onEdit, onDelete }) {
  if (notes.length === 0) {
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
          No production notes
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {notes.map((note) => (
        <div
          key={note.id}
          style={{
            background: "var(--bg-surface)",
            border: note.is_high_priority ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "16px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = note.is_high_priority ? "var(--status-error)" : "var(--border-default)";
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
                {note.content.substring(0, 80)}
                {note.content.length > 80 ? "..." : ""}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                }}
              >
                {new Date(note.note_date).toLocaleDateString()}
                {note.author && ` • ${note.author}`}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* Action Buttons */}
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit({ ...note, _quickResolve: true }); }}
                style={{
                  background: note.is_resolved ? "var(--success-muted)" : "transparent",
                  border: `1px solid ${note.is_resolved ? "var(--success-border)" : "var(--border-default)"}`,
                  borderRadius: 4, padding: "3px 8px",
                  color: note.is_resolved ? "var(--status-success)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", fontWeight: 700,
                }}
              >
                {note.is_resolved ? "✓ RESOLVED" : "RESOLVE"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(note); }}
                style={{
                  background: "transparent", border: "1px solid var(--border-default)",
                  borderRadius: 4, padding: "3px 8px",
                  color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                  fontSize: 8, cursor: "pointer", fontWeight: 700,
                }}
              >
                EDIT
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete && onDelete(note); }}
                style={{
                  background: "transparent", border: "1px solid var(--danger-border)",
                  borderRadius: 4, padding: "3px 7px",
                  color: "var(--status-error)", fontFamily: "var(--font-mono)",
                  fontSize: 8, cursor: "pointer", fontWeight: 700,
                }}
              >
                ✕
              </button>
              {/* Category Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: `${CATEGORY_COLORS[note.category]}20`,
                  border: `1px solid ${CATEGORY_COLORS[note.category]}40`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: CATEGORY_COLORS[note.category],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {note.category}
                </span>
              </div>

              {/* Resolution Status */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: note.is_resolved ? "var(--status-success)20" : "var(--status-warning)20",
                  border: `1px solid ${note.is_resolved ? "var(--status-success)40" : "var(--status-warning)40"}`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: note.is_resolved ? "var(--status-success)" : "var(--status-warning)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {note.is_resolved ? "Resolved" : "Open"}
                </span>
              </div>

              {/* Priority Flag */}
              {note.is_high_priority && (
                <span style={{ color: "var(--status-error)", fontSize: "14px", fontWeight: 700 }}>
                  ⚠
                </span>
              )}
            </div>
          </div>

          {/* Full Content */}
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--divider)" }}>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {note.content}
            </p>
            {note.sketch_data && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={note.sketch_data}
                  alt="Sketch"
                  style={{
                    width: "100%",
                    maxHeight: 200,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    objectFit: "contain",
                    background: "#0E0E10",
                  }}
                />
              </div>
            )}
          </div>

          {/* Resolution Info */}
          {note.is_resolved && note.resolved_date && (
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid var(--divider)",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                color: "var(--text-muted)",
              }}
            >
              Resolved {new Date(note.resolved_date).toLocaleDateString()}
              {note.resolved_by && ` by ${note.resolved_by}`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}