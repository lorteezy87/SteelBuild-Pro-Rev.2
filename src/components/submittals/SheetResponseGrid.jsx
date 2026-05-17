import React, { useState, useMemo, useCallback } from "react";

/**
 * SheetResponseGrid — per-sheet response entry when a submittal round
 * is returned by the reviewer.
 *
 * Renders a table of drawings (sheets) linked to the round's drawing
 * sets, with a response-status dropdown and reviewer-comment text input
 * per row. Includes an "Apply to All" row at the top to bulk-set the
 * response status.
 *
 * Props:
 *   round              — submittal_round record
 *   drawings           — drawing records (sheets from linked drawing sets)
 *   existingResponses  — submittal_sheet_responses for this round (edit mode)
 *   onSave             — callback(responses[]) with {drawing_id, sheet_number, response_status, reviewer_comment}
 *   onClose            — void callback
 */

const RESPONSE_OPTIONS = [
  "No Exception",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "See Comments",
];

const RESPONSE_COLORS = {
  "No Exception":        { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  "Approved as Noted":   { color: "#84CC16", bg: "rgba(132,204,22,0.15)" },
  "Revise and Resubmit": { color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  "Rejected":            { color: "#DC2626", bg: "rgba(220,38,38,0.15)" },
  "See Comments":        { color: "#2563EB", bg: "rgba(37,99,235,0.15)" },
};

export default function SheetResponseGrid({
  round,
  drawings = [],
  existingResponses = [],
  onSave,
  onClose,
}) {
  // Build initial state from existing responses or default
  const initialRows = useMemo(() => {
    const existingMap = new Map();
    existingResponses.forEach((r) => {
      existingMap.set(r.drawing_id, r);
    });

    return drawings.map((d) => {
      const existing = existingMap.get(d.id);
      return {
        drawing_id: d.id,
        sheet_number: d.sheet_number || d.drawing_number || "",
        title: d.title || d.drawing_title || "",
        discipline: d.discipline || "",
        response_status: existing?.response_status || "No Exception",
        reviewer_comment: existing?.reviewer_comment || "",
      };
    });
  }, [drawings, existingResponses]);

  const [rows, setRows] = useState(initialRows);
  const [applyAllStatus, setApplyAllStatus] = useState("");

  const updateRow = useCallback((idx, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const handleApplyAll = useCallback((status) => {
    setApplyAllStatus(status);
    if (!status) return;
    setRows((prev) => prev.map((r) => ({ ...r, response_status: status })));
  }, []);

  const handleSave = () => {
    const responses = rows.map((r) => ({
      drawing_id: r.drawing_id,
      sheet_number: r.sheet_number,
      response_status: r.response_status,
      reviewer_comment: r.reviewer_comment || null,
    }));
    onSave(responses);
  };

  // Table styles
  const thStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid var(--divider)",
    background: "var(--bg-surface-low)",
    position: "sticky",
    top: 0,
    zIndex: 2,
  };

  const tdStyle = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--divider)",
    verticalAlign: "middle",
  };

  return (
    <div className="sbd-card" style={{
      display: "flex",
      flexDirection: "column",
      maxHeight: "80vh",
      background: "var(--bg-surface)",
      borderRadius: 8,
      border: "1px solid var(--border-default)",
      overflow: "hidden",
      padding: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--divider)",
        background: "var(--bg-surface-low)",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
      }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontWeight: 800,
          color: "var(--text-primary)",
        }}>
          Sheet Responses
        </span>
        {round && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
          }}>
            Round {round.round_number || "?"}
          </span>
        )}
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          marginLeft: "auto",
        }}>
          {drawings.length} sheet{drawings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table className="sbd-table" style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 80 }}>Sheet #</th>
              <th style={thStyle}>Title</th>
              <th style={{ ...thStyle, width: 80 }}>Discipline</th>
              <th style={{ ...thStyle, width: 180 }}>Response</th>
              <th style={thStyle}>Reviewer Comment</th>
            </tr>
          </thead>
          <tbody>
            {/* Apply to All row */}
            <tr style={{ background: "var(--accent-muted)" }}>
              <td colSpan={3} style={{
                ...tdStyle,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>
                Apply to all
              </td>
              <td style={tdStyle}>
                <select
                  value={applyAllStatus}
                  onChange={(e) => handleApplyAll(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--accent)",
                    borderRadius: 3,
                    color: "var(--text-primary)",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="">-- select --</option>
                  {RESPONSE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
              <td style={tdStyle} />
            </tr>

            {/* Drawing rows */}
            {rows.map((row, idx) => {
              const rcfg = RESPONSE_COLORS[row.response_status] || {};
              return (
                <tr
                  key={row.drawing_id}
                  style={{
                    background: idx % 2 === 0 ? "transparent" : "var(--bg-surface-low)",
                  }}
                >
                  <td style={{
                    ...tdStyle,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}>
                    {row.sheet_number || "--"}
                  </td>
                  <td style={{
                    ...tdStyle,
                    color: "var(--text-primary)",
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                    title={row.title}
                  >
                    {row.title || "--"}
                  </td>
                  <td style={{
                    ...tdStyle,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}>
                    {row.discipline || "--"}
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={row.response_status}
                      onChange={(e) => updateRow(idx, "response_status", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        background: rcfg.bg || "var(--bg-surface-low)",
                        color: rcfg.color || "var(--text-primary)",
                        border: `1px solid ${rcfg.color || "var(--border-default)"}`,
                        borderRadius: 3,
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      {RESPONSE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.reviewer_comment}
                      onChange={(e) => updateRow(idx, "reviewer_comment", e.target.value)}
                      placeholder="Comment..."
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontFamily: "var(--font-body)",
                        background: "var(--bg-input, var(--bg-surface-low))",
                        border: "1px solid var(--border-default)",
                        borderRadius: 3,
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{
                  ...tdStyle,
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: 24,
                }}>
                  No drawings found for this round's linked drawing sets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 18px",
        borderTop: "1px solid var(--divider)",
        background: "var(--bg-surface-low)",
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
      }}>
        <button
          onClick={onClose}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          CANCEL
        </button>
        <button
          onClick={handleSave}
          disabled={rows.length === 0}
          style={{
            padding: "8px 14px",
            background: rows.length === 0 ? "var(--text-muted)" : "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            cursor: rows.length === 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.06em",
          }}
        >
          SAVE RESPONSES
        </button>
      </div>
    </div>
  );
}
