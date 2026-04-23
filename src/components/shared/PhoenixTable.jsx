import React from "react";

// A fully Phoenix-styled table wrapper — drop-in for all data tables
export default function PhoenixTable({ columns, children, loading, empty, colSpan }) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{
                fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--text-muted)",
                fontWeight: 700, padding: "12px 16px",
                background: "var(--bg-surface-low)",
                borderBottom: "1px solid var(--divider)",
                textAlign: col.right ? "right" : "left",
                whiteSpace: "nowrap"
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={colSpan || columns.length} style={{ textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(200,210,230,0.30)", letterSpacing: "0.1em" }}>LOADING...</td></tr>
          ) : !children || (Array.isArray(children) && children.length === 0) ? (
            <tr><td colSpan={colSpan || columns.length} style={{ textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(200,210,230,0.25)", letterSpacing: "0.1em" }}>{empty || "NO DATA"}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function PTR({ overdue, warn, onClick, children }) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: "1px solid var(--divider)",
        background: overdue ? "var(--danger-muted)" : warn ? "var(--warning-muted)" : "transparent",
        borderLeft: overdue ? "3px solid var(--status-error)" : warn ? "3px solid var(--status-warning)" : "3px solid transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!overdue && !warn) e.currentTarget.style.background = "var(--bg-row-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = overdue ? "var(--danger-muted)" : warn ? "var(--warning-muted)" : "transparent"; }}
    >
      {children}
    </tr>
  );
}

export function PTD({ right, mono, accent, muted, bold, children, style = {} }) {
  return (
    <td style={{
      fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
      fontSize: mono ? 12 : 13,
      color: accent ? "var(--accent-light)" : muted ? "var(--text-muted)" : "var(--text-secondary)",
      fontWeight: bold ? 700 : 400,
      padding: "11px 16px",
      textAlign: right ? "right" : "left",
      verticalAlign: "middle",
      maxWidth: style.maxWidth,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: style.whiteSpace || "nowrap",
      ...style
    }}>{children}</td>
  );
}