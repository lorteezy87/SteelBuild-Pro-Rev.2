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

import {
  RESPONSE_COLORS,
  RESPONSE_ABBR,
  DEFAULT_RESPONSE_COLOR as DEFAULT_COLOR,
  RESPONSE_MATRIX_EMPTY_STYLE,
  RESPONSE_MATRIX_TH_STYLE as th,
  RESPONSE_MATRIX_TD_STYLE as td,
  RESPONSE_MATRIX_WRAP_STYLE,
  RESPONSE_MATRIX_TABLE_STYLE,
} from "./responseMatrixHelpers";

export default function ResponseMatrix({ columns = [], rows = [] }) {
  if (!columns.length || !rows.length) {
    return (
      <div style={RESPONSE_MATRIX_EMPTY_STYLE}>
        No per-sheet reviewer responses recorded yet.
      </div>
    );
  }

  return (
    <div style={RESPONSE_MATRIX_WRAP_STYLE}>
      <table style={RESPONSE_MATRIX_TABLE_STYLE}>
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
