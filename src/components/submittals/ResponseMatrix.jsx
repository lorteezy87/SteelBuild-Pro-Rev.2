import React from "react";

/**
 * ResponseMatrix — round-over-round per-sheet reviewer dispositions.
 *
 * Reads the matrix shape from submittalResubmittal.buildResponseMatrix:
 * columns are the rounds that carry responses (ascending), rows are unique
 * sheets, each cell is that sheet's disposition in that round. Lets the team
 * see at a glance how each sheet moved across rounds (R1 R&R → R2 No Exception).
 *
 * Props:
 *   columns — MatrixColumn[] { id, round_number }
 *   rows    — MatrixRow[]    { key, sheet_number, title, cells: { [roundId]: { response_status, reviewer_comment } } }
 */

const RESPONSE_COLORS = {
  "No Exception":        { color: "var(--status-success)", bg: "var(--success-muted)" },
  "Approved as Noted":   { color: "var(--status-success-bright)", bg: "color-mix(in srgb, var(--status-success-bright) 15%, transparent)" },
  "Revise and Resubmit": { color: "var(--status-review)", bg: "var(--status-review-muted)" },
  "Rejected":            { color: "var(--status-error)", bg: "var(--danger-muted)" },
  "See Comments":        { color: "var(--status-info)", bg: "var(--info-muted)" },
};
const RESPONSE_ABBR = {
  "No Exception": "NE",
  "Approved as Noted": "AAN",
  "Revise and Resubmit": "R&R",
  "Rejected": "REJ",
  "See Comments": "SC",
};
const DEFAULT_COLOR = { color: "var(--text-muted)", bg: "var(--bg-surface-low)" };

export default function ResponseMatrix({ columns = [], rows = [] }) {
  if (!columns.length || !rows.length) {
    return (
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-muted)",
        fontStyle: "italic",
        padding: "6px 0",
      }}>
        No per-sheet reviewer responses recorded yet.
      </div>
    );
  }

  const th = {
    fontFamily: "var(--font-mono)",
    fontSize: 8.5,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "6px 8px",
    borderBottom: "1px solid var(--divider)",
    background: "var(--bg-surface-low)",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "5px 8px",
    borderBottom: "1px solid var(--divider)",
    verticalAlign: "middle",
  };

  return (
    <div style={{
      border: "1px solid var(--border-default)",
      borderRadius: 6,
      overflow: "auto",
      maxHeight: 320,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Sheet</th>
            {columns.map((c) => (
              <th key={c.id} style={{ ...th, textAlign: "center" }}>R{c.round_number}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.key} style={{ background: idx % 2 === 0 ? "transparent" : "var(--bg-surface-low)" }}>
              <td style={{
                ...td,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                position: "sticky",
                left: 0,
                background: "inherit",
              }}
                title={row.title || undefined}
              >
                {row.sheet_number}
              </td>
              {columns.map((c) => {
                const cell = row.cells[c.id];
                if (!cell) {
                  return (
                    <td key={c.id} style={{ ...td, textAlign: "center", color: "var(--border-default)" }}>·</td>
                  );
                }
                const cfg = RESPONSE_COLORS[cell.response_status] || DEFAULT_COLOR;
                const abbr = RESPONSE_ABBR[cell.response_status] || cell.response_status;
                const tip = cell.reviewer_comment
                  ? `${cell.response_status} — ${cell.reviewer_comment}`
                  : cell.response_status;
                return (
                  <td key={c.id} style={{ ...td, textAlign: "center" }}>
                    <span
                      title={tip}
                      style={{
                        display: "inline-block",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: 3,
                        color: cfg.color,
                        background: cfg.bg,
                        letterSpacing: "0.04em",
                        cursor: cell.reviewer_comment ? "help" : "default",
                      }}
                    >
                      {abbr}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
