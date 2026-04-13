import React from "react";

const CATEGORY_COLORS = {
  General: "var(--text-muted)",
  Safety: "var(--status-error)",
  Quality: "var(--status-warning)",
  Schedule: "var(--status-info)",
  Fabrication: "var(--accent)",
  Erection: "var(--status-success)",
};

export default function ProductionNoteList({ notes = [], onEdit, onDelete }) {
  if (notes.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {notes.map((note) => (
        <div
          key={note.id}
          style={{
            background: "var(--bg-surface)",
            border: note.is_high_priority ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            borderLeft: `4px solid ${CATEGORY_COLORS[note.category] || "var(--border-default)"}`,
            padding: "16px 18px 14px 16px",
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
          {/* ── ROW 1: Meta strip + Actions ──────────────────── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 8,
          }}>
            {/* LEFT — Category + date + author */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: CATEGORY_COLORS[note.category] || "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}>
                {note.category || "General"}
              </span>

              <span style={{ color: "var(--border-strong)", fontSize: 9, lineHeight: 1 }}>·</span>

              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}>
                {note.note_date ? new Date(note.note_date + "T00:00:00Z").toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
                }) : ""}
              </span>

              {note.author && (
                <>
                  <span style={{ color: "var(--border-strong)", fontSize: 9, lineHeight: 1 }}>·</span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}>
                    {note.author}
                  </span>
                </>
              )}

              {note.is_resolved && (
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--status-success)",
                  background: "var(--success-muted)",
                  border: "1px solid var(--success-border)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-badge)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}>
                  ✓ RESOLVED
                </span>
              )}

              {note.is_high_priority && (
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--status-error)",
                  background: "var(--danger-muted)",
                  border: "1px solid var(--danger-border)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-badge)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}>
                  ⚑ PRIORITY
                </span>
              )}
            </div>

            {/* RIGHT — Action buttons */}
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit({ ...note, _quickResolve: true }); }}
                title={note.is_resolved ? "Mark as open" : "Mark as resolved"}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "3px 8px",
                  color: note.is_resolved ? "var(--status-success)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  transition: "color 0.1s, border-color 0.1s",
                }}
              >
                {note.is_resolved ? "✓" : "○"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(note); }}
                title="Edit note"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "3px 8px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                }}
              >
                EDIT
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete && onDelete(note); }}
                title="Delete note"
                style={{
                  background: "transparent",
                  border: "1px solid var(--danger-border)",
                  borderRadius: "var(--radius-btn)",
                  padding: "3px 7px",
                  color: "var(--status-error)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── ROW 2: Note content — primary reading surface ── */}

          {/* Body */}
          <div style={{ marginBottom: "10px" }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "6px",
                lineHeight: 1.4,
              }}
            >
              {note.content.substring(0, 80)}
              {note.content.length > 80 ? "..." : ""}
            </div>
            <div
              style={{
                paddingTop: "10px",
                borderTop: "1px solid var(--divider)",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
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
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              alignItems: "center",
              paddingTop: "8px",
              borderTop: "1px solid var(--divider)",
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onEdit && onEdit({ ...note, _quickResolve: true }); }}
              style={{
                background: note.is_resolved ? "var(--success-muted)" : "transparent",
                border: `1px solid ${note.is_resolved ? "var(--success-border)" : "var(--border-default)"}`,
                borderRadius: 4, padding: "4px 9px",
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
                borderRadius: 4, padding: "4px 9px",
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
                borderRadius: 4, padding: "4px 8px",
                color: "var(--status-error)", fontFamily: "var(--font-mono)",
                fontSize: 8, cursor: "pointer", fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>

          {/* Resolution Info */}
          {note.is_resolved && note.resolved_date && (
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
              }}
            >
              Resolved{" "}
              {new Date(note.resolved_date + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              {note.resolved_by && ` · ${note.resolved_by}`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
