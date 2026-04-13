import React from "react";
import { STAGE_MAP, mono } from "./drawingsConfig";
import StageChip from "./StageChip";
import { OverdueBadge, RFILinkBadge, SupersededBadge } from "./DrawingBadges";
import { isOverdue } from "./drawingsUtils";

// ─── Small action button (shared with DrawingsTable) ────────────────────────

function ActionBtn({ label, onClick, danger, disabled, title }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = danger ? "var(--status-error)" : "var(--text-muted)";
  const hoverBg = danger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 2,
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

// ─── Main grid component ────────────────────────────────────────────────────

/**
 * Card-based grid view for drawings — shows sheet number, title, stage, badges.
 */
export default function DrawingsGrid({
  drawings, selected, onToggleSelect,
  onEdit, onDelete, onAdvance, onView,
  onSetApproval, rfiMap,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {drawings.map(d => {
        const overdue = isOverdue(d);
        const isSel = selected.has(d.id);
        const stage = STAGE_MAP[d.stage] || STAGE_MAP["Not Started"];
        return (
          <div
            key={d.id}
            onClick={() => onToggleSelect(d.id)}
            style={{
              background: "var(--bg-surface)",
              border: `1px solid ${isSel ? "var(--accent)" : "var(--border-default)"}`,
              borderRadius: 2,
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
              transition: "border-color 0.15s",
            }}
          >
            {/* Stage color strip */}
            <div style={{ height: 3, background: stage.color }} />

            {/* Priority indicator */}
            {d.priority_flag && (
              <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)" }} />
            )}

            <div style={{ padding: "12px 14px" }}>
              {/* Sheet number */}
              <div style={{
                ...mono, fontSize: 15, fontWeight: 800, color: "var(--text-primary)",
                letterSpacing: "-0.01em", marginBottom: 4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {d.sheet_number}
              </div>

              {/* Title */}
              <div style={{
                fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)",
                marginBottom: 10, overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4,
              }}>
                {d.title}
              </div>

              {/* Stage + Rev + Badges */}
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <StageChip stage={d.stage} />
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>R{d.revision_number ?? "0"}</span>
                {overdue && <OverdueBadge />}
                {(d.is_superseded || d.set_approval_status === "superseded") && <SupersededBadge />}
              </div>

              {/* RFI Links */}
              <RFILinkBadge linkedIds={d.linked_rfi_ids} rfiMap={rfiMap} />

              {/* Due date */}
              {d.due_date && (
                <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", marginTop: 4 }}>
                  DUE {d.due_date}
                </div>
              )}

              {/* Discipline */}
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, opacity: 0.6 }}>{d.discipline}</div>

              {/* Set approval status */}
              {d.set_approval_status && (
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 2,
                    color: d.set_approval_status === "approved" ? "#10B981" : d.set_approval_status === "rejected" ? "var(--status-error)" : "var(--text-muted)",
                    background: d.set_approval_status === "approved" ? "rgba(16,185,129,0.12)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.12)" : "var(--bg-surface-high)",
                    border: `1px solid ${d.set_approval_status === "approved" ? "rgba(16,185,129,0.25)" : d.set_approval_status === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
                    textTransform: "uppercase",
                  }}>
                    {d.set_approval_status}
                  </span>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div
              style={{
                borderTop: "1px solid var(--border-default)",
                padding: "7px 10px",
                display: "flex",
                gap: 5,
                justifyContent: "flex-end",
              }}
              onClick={e => e.stopPropagation()}
            >
              <ActionBtn label="View" onClick={() => onView(d)} />
              <ActionBtn label="Edit" onClick={() => onEdit(d)} />
              {d.drawing_set_name?.trim() && !d.set_approval_status && (
                <ActionBtn label="Approve" onClick={() => onSetApproval(d.drawing_set_name.trim())} />
              )}
              <ActionBtn label="\u2192" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
              <ActionBtn label="\u2715" onClick={() => onDelete(d.id)} danger />
            </div>
          </div>
        );
      })}
    </div>
  );
}
