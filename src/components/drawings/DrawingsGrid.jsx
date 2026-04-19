import React, { useMemo, useState } from "react";
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
  drawings, drawingSets = [], selected, onToggleSelect,
  onEdit, onDelete, onAdvance, onView,
  onSetApproval, onRenameSet, onDeleteSet, rfiMap,
}) {
  // Parent drawing_sets rows that have no child sheets in `drawings` are
  // invisible in a pure sheet-iteration grid. Surface them as placeholder
  // cards so the user can see and act on every set in the project.
  const setOnlyEntries = useMemo(() => {
    const referencedIds = new Set(drawings.map(d => d.drawing_set_id).filter(Boolean));
    const referencedNames = new Set(
      drawings.map(d => (d.drawing_set_name || "").trim()).filter(Boolean),
    );
    return drawingSets.filter(s => {
      if (s?.is_deleted) return false;
      if (referencedIds.has(s.id)) return false;
      if (s.set_name && referencedNames.has(s.set_name.trim())) return false;
      return true;
    });
  }, [drawings, drawingSets]);

  // Expanded set-only cards track by id.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {/* Set-only placeholder cards — these are parent drawing_sets rows
          that have zero child sheets yet (common for sets imported from a
          Drive walk or created upfront). Click to expand; actions live in
          the expanded footer. */}
      {setOnlyEntries.map(s => {
        const isOpen = expanded.has(s.id);
        return (
          <SetPlaceholderCard
            key={`set:${s.id}`}
            set={s}
            expanded={isOpen}
            onToggle={() => toggleExpand(s.id)}
            onRenameSet={onRenameSet}
            onDeleteSet={onDeleteSet}
            onSetApproval={onSetApproval}
          />
        );
      })}
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
              <ActionBtn label="Next" title="Advance stage" onClick={() => onAdvance(d)} disabled={d.stage === "Released"} />
              <ActionBtn label="Del" onClick={() => onDelete(d.id)} title="Delete" danger />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Set-only placeholder card ──────────────────────────────────────────────
//
// Rendered for drawing_sets parent rows that have no child sheets yet.
// Collapsed: shows just the set name + sheet_count pill + a hint that it's
// clickable. Expanded: shows revision, issued_date, processing counts, and
// Rename / Delete / Approve actions.

function SetPlaceholderCard({ set, expanded, onToggle, onRenameSet, onDeleteSet, onSetApproval }) {
  const sheetCount = Number(set.sheet_count) || 0;
  const needsReview = Number(set.needs_review_count) || 0;
  const processed = Number(set.processed_count) || 0;
  const failed = Number(set.failed_count) || 0;
  const approval = set.set_approval_status || null;

  // Build a synthetic "group" shape so onRenameSet / onDeleteSet can reuse
  // the same signature the list view uses. Parent FK + empty sheet list
  // signals a set-only delete to handleDeleteSet().
  const group = {
    name: set.set_name,
    setId: set.id,
    parent: set,
    sheets: [],
    isUngrouped: false,
  };

  return (
    <div
      onClick={onToggle}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${expanded ? "var(--accent)" : "var(--border-default)"}`,
        borderRadius: 2,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        gridColumn: expanded ? "span 2" : "auto",
        transition: "border-color 0.15s",
      }}
    >
      {/* Accent strip — amber to distinguish from sheet cards */}
      <div style={{ height: 3, background: "var(--accent)" }} />

      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{
            ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--accent)", padding: "2px 5px", borderRadius: 2,
            border: "1px solid var(--accent)",
          }}>
            SET
          </span>
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
            {sheetCount} sheet{sheetCount === 1 ? "" : "s"}
          </span>
          {set.revision && (
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>· REV {set.revision}</span>
          )}
        </div>

        <div style={{
          ...mono, fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
          letterSpacing: "-0.01em", marginBottom: 4,
          overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: expanded ? "normal" : "nowrap",
        }}>
          {set.set_name || "Untitled Set"}
        </div>

        {set.description && (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)",
            marginBottom: 6, overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: expanded ? 4 : 2, WebkitBoxOrient: "vertical", lineHeight: 1.4,
          }}>
            {set.description}
          </div>
        )}

        {/* Collapsed quick stats */}
        {!expanded && (
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.06em" }}>
            Click to expand
          </div>
        )}

        {/* Expanded detail block */}
        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <Stat label="Sheets"        value={sheetCount} />
              <Stat label="Processed"     value={processed} />
              <Stat label="Needs Review"  value={needsReview} accent={needsReview > 0 ? "var(--status-warning)" : null} />
              <Stat label="Failed"        value={failed}      accent={failed > 0      ? "var(--status-error)"   : null} />
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 8, letterSpacing: "0.06em" }}>
              {set.issued_date && <>ISSUED {set.issued_date}</>}
              {set.issued_date && set.issued_by && <> · </>}
              {set.issued_by && <>by {set.issued_by}</>}
              {!set.issued_date && !set.issued_by && <>No issue metadata recorded</>}
            </div>
            {approval && (
              <div style={{ marginTop: 8 }}>
                <span style={{
                  ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 2,
                  color: approval === "approved"       ? "#10B981"
                       : approval === "rejected"       ? "var(--status-error)"
                       : approval === "pending_review" ? "var(--status-warning)"
                       :                                  "var(--text-muted)",
                  background: approval === "approved"  ? "rgba(16,185,129,0.12)"
                       : approval === "rejected"       ? "rgba(239,68,68,0.12)"
                       : approval === "pending_review" ? "rgba(245,158,11,0.14)"
                       :                                  "var(--bg-surface-high)",
                  border: `1px solid ${approval === "approved" ? "rgba(16,185,129,0.25)" : approval === "rejected" ? "rgba(239,68,68,0.25)" : "var(--border-default)"}`,
                  textTransform: "uppercase",
                }}>
                  {approval}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions footer — only shown when expanded */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border-default)",
            padding: "7px 10px",
            display: "flex",
            gap: 5,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
          onClick={e => e.stopPropagation()}
        >
          {set.file_url && (
            <ActionBtn
              label="Open PDF"
              title="Open the set's current PDF"
              onClick={() => window.open(set.file_url, "_blank", "noopener")}
            />
          )}
          {onSetApproval && !approval && (
            <ActionBtn
              label="Approve"
              onClick={() => onSetApproval(set.set_name)}
            />
          )}
          {onRenameSet && (
            <ActionBtn
              label="Rename"
              title={`Rename set "${set.set_name}"`}
              onClick={() => onRenameSet(group)}
            />
          )}
          {onDeleteSet && (
            <ActionBtn
              label="Delete Set"
              danger
              title={`Delete set "${set.set_name}"`}
              onClick={() => onDeleteSet(group)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: accent || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
