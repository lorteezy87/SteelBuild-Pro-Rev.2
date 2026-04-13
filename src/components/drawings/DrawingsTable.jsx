import React from "react";
import { mono } from "./drawingsConfig";
import StageChip from "./StageChip";
import PriorityDot from "./PriorityDot";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue, daysLate, urgencyClass } from "./drawingsUtils";

// ─── Small UI primitives ────────────────────────────────────────────────────

function ActionBtn({ label, onClick, danger, disabled, title, primary }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = primary ? "var(--accent)" : danger ? "var(--status-error)" : "var(--text-muted)";
  const hoverBg = primary ? "rgba(200,155,32,0.12)" : danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: "var(--radius-badge)",
        border: `1px solid ${hovered && !disabled ? baseColor + "60" : danger ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
        background: hovered && !disabled ? hoverBg : "none",
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export function ContextMenuItem({ label, onClick, danger }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
        background: hovered ? (danger ? "rgba(239,68,68,0.08)" : "var(--hover-bg)") : "none",
        border: "none", cursor: "pointer", ...mono, fontSize: 10,
        fontWeight: 700, letterSpacing: "0.08em",
        color: danger ? "var(--status-error)" : "var(--text-primary)",
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ─── Main table component ───────────────────────────────────────────────────

/**
 * Tabular list view for drawings — checkbox selection, inline actions, right-click context.
 */
export default function DrawingsTable({
  drawings, selected, onToggleSelect, onToggleAll,
  onEdit, onDelete, onAdvance, onView,
  setContextMenu, onSetApproval, rfiMap,
}) {
  const allSelected = selected.size === drawings.length && drawings.length > 0;

  const thStyle = {
    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em",
    color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 12px",
    textAlign: "left", borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap", background: "var(--bg-surface)",
  };
  const tdStyle = {
    padding: "10px 12px",
    borderBottom: "1px solid var(--divider)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} style={{ cursor: "pointer" }} />
            </th>
            <th style={thStyle}>SHEET #</th>
            <th style={thStyle}>TITLE</th>
            <th style={thStyle}>DISCIPLINE</th>
            <th style={thStyle}>REV</th>
            <th style={thStyle}>STAGE</th>
            <th style={thStyle}>SUBMITTED</th>
            <th style={thStyle}>DUE DATE</th>
            <th style={thStyle}>REVIEWER</th>
            <th style={thStyle}>APPROVAL</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {drawings.map(d => {
            const overdue = isOverdue(d);
            const isSel = selected.has(d.id);
            const late = daysLate(d);
            const urgency = urgencyClass(late);
            return (
              <tr
                key={d.id}
                className={urgency}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, drawing: d }); }}
                style={{
                  background: isSel ? "rgba(200,155,32,0.06)" : overdue ? "rgba(239,68,68,0.04)" : "none",
                  cursor: "default",
                  borderLeft: overdue ? "4px solid var(--status-error)" : "4px solid transparent",
                }}
              >
                <td style={tdStyle}>
                  <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(d.id)} style={{ cursor: "pointer" }} />
                </td>

                {/* Sheet number + priority */}
                <td style={{ ...tdStyle, ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PriorityDot active={d.priority_flag} />
                    {d.sheet_number}
                  </div>
                </td>

                {/* Title + badges */}
                <td style={{ ...tdStyle, maxWidth: 280 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.title}
                  </div>
                  <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />
                  {(d.is_superseded || d.set_approval_status === "superseded") && (
                    <div style={{ marginTop: 3 }}><SupersededBadge /></div>
                  )}
                </td>

                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.discipline}</td>
                <td style={{ ...tdStyle, ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>R{d.revision_number ?? "0"}</td>
                <td style={tdStyle}><StageChip stage={d.stage} /></td>
                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d.submitted_date || "—"}</td>

                {/* Due date / days late */}
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {overdue && late > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--status-error)" }}>
                        {late}d late
                      </span>
                      <OverdueBadge />
                    </div>
                  ) : (
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.due_date || "—"}</span>
                  )}
                </td>

                <td style={{ ...tdStyle, ...mono, fontSize: 10, color: "var(--text-muted)" }}>{d.reviewer || "—"}</td>

                {/* Approval status */}
                <td style={tdStyle}>
                  {d.set_approval_status ? (
                    <span style={{
                      ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "var(--radius-badge)",
                      color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
                      background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
                      border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
                      textTransform: "uppercase",
                    }}>
                      {d.set_approval_status}
                    </span>
                  ) : d.drawing_set_name?.trim() ? (
                    <button
                      onClick={() => onSetApproval(d.drawing_set_name.trim())}
                      style={{
                        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "var(--radius-badge)",
                        background: "none", border: "1px dashed var(--border-strong)", color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      REVIEW
                    </button>
                  ) : (
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>—</span>
                  )}
                </td>

                {/* Row actions */}
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <ActionBtn label="View" onClick={() => onView(d)} />
                    <ActionBtn label="Edit" onClick={() => onEdit(d)} />
                    <ActionBtn label="Next" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
                    <ActionBtn label="Del" onClick={() => onDelete(d.id)} title="Delete" danger />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
