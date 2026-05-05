import React from "react";
import { Trash2 } from "lucide-react";

const COLORS = ["var(--accent)", "#FF3D3D", "var(--status-warning)", "#FFE600", "var(--status-success)", "var(--accent)", "#0D9488", "#FFFFFF"];

export default function MarkupPropertiesPanel({ markup, onUpdate, onDelete }) {
  if (!markup) return null;

  const label = s => (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 8,
      color: "var(--text-muted)", marginBottom: 5,
      textTransform: "uppercase", letterSpacing: "0.12em",
    }}>{s}</div>
  );

  return (
    <div className="sbd-sidebar" style={{
      width: 260,
      background: "var(--bg-surface-low)",
      borderLeft: "1px solid var(--bg-surface-high)",
      borderRight: "none",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      flexShrink: 0,
      padding: 0,
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--bg-surface-high)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          fontWeight: 600, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          PROPERTIES — {markup.type.toUpperCase()}
        </span>
        <button
          onClick={onDelete}
          title="Delete markup"
          style={{
            background: "rgba(255,61,61,0.10)", border: "1px solid rgba(255,61,61,0.20)",
            borderRadius: 5, color: "var(--status-error-bright)", cursor: "pointer",
            width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Color */}
        <div>
          {label("Color")}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onUpdate({ color })}
                style={{
                  width: 26, height: 26, borderRadius: 5,
                  background: color,
                  border: markup.color === color ? "2px solid var(--border-strong)" : "1px solid var(--border-strong)",
                  cursor: "pointer",
                  transform: markup.color === color ? "scale(1.12)" : "scale(1)",
                  transition: "transform 0.1s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Opacity */}
        <div>
          {label(`Opacity: ${markup.opacity ?? 100}%`)}
          <input
            type="range" min="10" max="100" step="5"
            value={markup.opacity ?? 100}
            onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>

        {/* Line width (not for stamps/text) */}
        {!["text", "stamp"].includes(markup.type) && (
          <div>
            {label("Line Weight")}
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 5].map((w) => (
                <button
                  key={w}
                  onClick={() => onUpdate({ lineWidth: w })}
                  style={{
                    flex: 1, padding: "5px 0",
                    background: markup.lineWidth === w ? "var(--accent-muted)" : "var(--hover-bg)",
                    border: `1px solid ${markup.lineWidth === w ? "var(--accent-border)" : "var(--border-default)"}`,
                    color: markup.lineWidth === w ? "var(--accent)" : "var(--text-secondary)",
                    borderRadius: 5, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 9,
                  }}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Font size for text */}
        {markup.type === "text" && (
          <div>
            {label("Font Size")}
            <div style={{ display: "flex", gap: 4 }}>
              {[10, 12, 14, 18, 24].map((fs) => (
                <button
                  key={fs}
                  onClick={() => onUpdate({ fontSize: fs })}
                  style={{
                    flex: 1, padding: "5px 0",
                    background: markup.fontSize === fs ? "var(--accent-muted)" : "var(--hover-bg)",
                    border: `1px solid ${markup.fontSize === fs ? "var(--accent-border)" : "var(--border-default)"}`,
                    color: markup.fontSize === fs ? "var(--accent)" : "var(--text-secondary)",
                    borderRadius: 5, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 9,
                  }}
                >
                  {fs}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text content for text markups */}
        {markup.type === "text" && (
          <div>
            {label("Text")}
            <input
              type="text"
              value={markup.text || ""}
              onChange={(e) => onUpdate({ text: e.target.value })}
              style={{
                width: "100%", padding: "6px 8px",
                background: "var(--hover-bg)",
                border: "1px solid var(--border-default)",
                color: markup.color || "var(--accent)",
                borderRadius: 5,
                fontFamily: "var(--font-body)", fontSize: 12,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Arrow toggle for line */}
        {markup.type === "line" && (
          <div>
            {label("Arrow Head")}
            <button
              onClick={() => onUpdate({ arrow: !markup.arrow })}
              style={{
                padding: "5px 12px",
                background: markup.arrow ? "var(--accent-muted)" : "var(--hover-bg)",
                border: `1px solid ${markup.arrow ? "var(--accent-border)" : "var(--border-default)"}`,
                color: markup.arrow ? "var(--accent)" : "var(--text-secondary)",
                borderRadius: 5, cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 9,
              }}
            >
              {markup.arrow ? "→ ON" : "— OFF"}
            </button>
          </div>
        )}

        {/* Note / subject */}
        <div>
          {label("Note")}
          <textarea
            value={markup.subject || ""}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder="Optional note..."
            rows={3}
            style={{
              width: "100%", padding: "6px 8px",
              background: "var(--hover-bg)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              borderRadius: 5,
              fontFamily: "var(--font-body)", fontSize: 11,
              resize: "vertical", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Status */}
        <div>
          {label("Review Status")}
          <select
            value={markup.status || "none"}
            onChange={(e) => onUpdate({ status: e.target.value })}
            style={{
              width: "100%", padding: "6px 8px",
              background: "var(--hover-bg)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)", borderRadius: 5,
              fontFamily: "var(--font-body)", fontSize: 11,
            }}
          >
            <option value="none">None</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Pending Review</option>
          </select>
        </div>
      </div>
    </div>
  );
}