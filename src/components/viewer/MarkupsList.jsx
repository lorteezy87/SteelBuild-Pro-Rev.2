import React from "react";
import { Trash2 } from "lucide-react";

const TYPE_ICON = {
  rect:     "□",
  line:     "╱",
  arrow:    "→",
  freehand: "✏",
  text:     "T",
  stamp:    "■",
};

const STATUS_COLOR = {
  accepted: "var(--status-success-bright)",
  rejected: "var(--status-error-bright)",
  pending:  "var(--status-warning-bright)",
  none:     "rgba(160,175,210,0.30)",
};

export default function MarkupsList({ markups, allMarkups = [], onSelectMarkup, onDelete, currentPage, totalPages }) {
  const otherPageCount = allMarkups.length - markups.length;

  return (
    <div style={{
      width: 260,
      background: "var(--bg-sidebar)",
      borderLeft: "1px solid var(--bg-surface-high)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--bg-surface-high)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          MARKUPS
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8,
            background: "var(--info-muted)", border: "1px solid var(--info-border)",
            color: "var(--status-info)", borderRadius: 10, padding: "1px 7px",
          }}>
            {markups.length} pg {currentPage}
          </span>
          {otherPageCount > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: "var(--text-muted)", letterSpacing: "0.06em",
            }}>
              +{otherPageCount} other
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {markups.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: "var(--text-muted)", letterSpacing: "0.10em",
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✏</div>
            NO MARKUPS ON PAGE {currentPage}
            {otherPageCount > 0 && (
              <div style={{ marginTop: 6, color: "rgba(160,175,210,0.20)", fontSize: 8 }}>
                {otherPageCount} markup{otherPageCount !== 1 ? "s" : ""} on other pages
              </div>
            )}
          </div>
        ) : (
          markups.map((markup, idx) => (
            <div
              key={markup.id}
              onClick={() => onSelectMarkup(markup)}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--hover-bg)",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {/* Type icon */}
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: `${markup.color || "var(--accent)"}18`,
                  border: `1px solid ${markup.color || "var(--accent)"}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: markup.color || "var(--accent)",
                  fontSize: 14, fontFamily: "monospace",
                }}>
                  {TYPE_ICON[markup.type] || "•"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 11,
                    color: "var(--text-primary)", fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 2,
                  }}>
                    {markup.subject || markup.text || markup.type.charAt(0).toUpperCase() + markup.type.slice(1)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      #{idx + 1} · {markup.type}
                    </span>
                    {markup.status && markup.status !== "none" && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 9,
                        color: STATUS_COLOR[markup.status] || STATUS_COLOR.none,
                        letterSpacing: "0.06em",
                      }}>
                        ● {markup.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(markup.id); }}
                  style={{
                    background: "none", border: "none",
                    color: "rgba(160,175,210,0.30)", cursor: "pointer",
                    padding: 2, flexShrink: 0, lineHeight: 1,
                    transition: "color 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error-bright)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(160,175,210,0.30)")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer tip */}
      {markups.length === 0 && (
        <div style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--hover-bg)",
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-muted)", textAlign: "center", letterSpacing: "0.10em",
        }}>
          CLICK "MARKUP" TO START ANNOTATING
        </div>
      )}
    </div>
  );
}