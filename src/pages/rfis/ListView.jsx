/**
 * ListView — the dense data-table view. Sticky 10-column header, then
 * project-grouped rows. Each row: checkbox, RFI # (with a $ badge for
 * cost-impact amount tier), subject + drawing/spec subtitle, priority
 * pill, status pill + impact flags, BIC pill, due date (with days-
 * late subtitle if overdue), days open, days held, and four action
 * buttons (STATUS / EDIT / DEL / MIT).
 *
 * Callbacks:
 *   onSelect(r)       — open detail
 *   onToggleSelect(id) — checkbox toggle
 *   onToggleAll()     — header checkbox
 *   onToggleStatus(r) — advance to next workflow status
 *   onEdit(r), onDelete(r), onCreateMitigation(r)
 */

import React from "react";
import { mono, PRIORITY_CFG, STATUS_CFG, BIC_COLORS } from "./constants";
import { isOverdue, daysOpen } from "./utils";
import { Pill } from "./subcomponents";

const GRID_COLS = "28px 80px 2fr 90px 100px 110px 72px 52px 52px 90px";

const actionBtn = {
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  borderRadius: 4,
  padding: "4px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  minHeight: 28,
  cursor: "pointer",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export default function ListView({
  filtered,
  groupedByProject,
  projectId,
  selectedRFI,
  selectedRFIs,
  onSelect,
  onToggleSelect,
  onToggleAll,
  onToggleStatus,
  onEdit,
  onDelete,
  onCreateMitigation,
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch", position: "relative" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: GRID_COLS, background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)", padding: "10px 12px", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
        <div>
          <input
            type="checkbox"
            checked={filtered.length > 0 && selectedRFIs.size === filtered.length}
            onChange={onToggleAll}
            style={{ cursor: "pointer", accentColor: "var(--accent)" }}
          />
        </div>
        <div>RFI #</div>
        <div>Subject</div>
        <div>Priority</div>
        <div>Status</div>
        <div>Ball in Court</div>
        <div>Due</div>
        <div>Days</div>
        <div>Held</div>
        <div>Actions</div>
      </div>
      {Object.entries(groupedByProject).map(([proj, rows]) => (
        <div key={proj} style={{ borderBottom: "1px solid var(--divider)" }}>
          {!projectId && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ width: 4, height: 20, background: "var(--accent)" }} />
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-primary)" }}>{proj}</div>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{rows.length} RFIs</div>
              <div style={{ ...mono, fontSize: 8, color: "var(--status-error)", marginLeft: 6 }}>{rows.filter((r) => isOverdue(r)).length} overdue</div>
            </div>
          )}
          {rows.map((r) => (
            <Row
              key={r.id}
              r={r}
              isSelected={selectedRFI?.id === r.id}
              isChecked={selectedRFIs.has(r.id)}
              onSelect={onSelect}
              onToggleSelect={onToggleSelect}
              onToggleStatus={onToggleStatus}
              onEdit={onEdit}
              onDelete={onDelete}
              onCreateMitigation={onCreateMitigation}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Row({ r, isSelected, isChecked, onSelect, onToggleSelect, onToggleStatus, onEdit, onDelete, onCreateMitigation }) {
  const overdue = isOverdue(r);
  const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
  const st = STATUS_CFG[r.status] || STATUS_CFG.Open;
  const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
  const due = r.date_required ? new Date(r.date_required + "T00:00:00") : null;
  const diff = due ? Math.ceil((due - new Date()) / 86400000) : null;
  const overdueDays = overdue && diff != null ? Math.abs(diff) : 0;
  const rowBg = overdue ? "rgba(255,61,61,0.12)" : "transparent";
  const leftBorder =
    overdue && r.priority === "Critical" ? "3px solid var(--status-error)"
    : overdue ? "3px solid rgba(255,61,61,0.7)"
    : r.priority === "Critical" ? "3px solid var(--status-warning)"
    : "3px solid transparent";
  const urgencyClass = overdue && overdueDays >= 7 ? "urgency-danger" : overdue && overdueDays >= 1 ? "urgency-warn" : "";
  const heldDate = r.ball_in_court_date || r.submitted_date;
  const heldDays = heldDate ? Math.max(0, Math.floor((new Date() - new Date(heldDate)) / 86400000)) : null;
  const heldColor = heldDays != null && heldDays > 14 ? "var(--status-error)" : heldDays != null && heldDays > 7 ? "var(--status-warning)" : "var(--text-muted)";

  return (
    <div
      className={urgencyClass}
      onClick={() => onSelect(r)}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        padding: "10px 12px",
        alignItems: "center",
        borderBottom: "1px solid var(--divider)",
        cursor: "pointer",
        background: isSelected ? "var(--accent-muted)" : rowBg,
        borderLeft: leftBorder,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? "var(--accent-muted)" : "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? "var(--accent-muted)" : rowBg)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleSelect(r.id)}
          style={{ cursor: "pointer", accentColor: "var(--accent)" }}
        />
      </div>
      <div style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>
        {r.priority === "Critical" && <span style={{ color: "var(--status-error)", marginRight: 4 }}>⚠</span>}
        {r.rfi_number}
        {r.cost_impact === true && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            borderRadius: "var(--radius-badge, 3px)",
            padding: "1px 4px",
            marginLeft: 4,
            display: "inline-block",
            background: Number(r.cost_impact_amount) > 25000 ? "var(--danger-muted)" : Number(r.cost_impact_amount) > 5000 ? "var(--warning-muted)" : "var(--hover-bg)",
            color: Number(r.cost_impact_amount) > 25000 ? "var(--status-error)" : Number(r.cost_impact_amount) > 5000 ? "var(--status-warning)" : "var(--text-muted)",
          }}>
            {Number(r.cost_impact_amount) > 25000 ? "$$$" : Number(r.cost_impact_amount) > 5000 ? "$$" : "$"}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", textDecoration: r.status === "Closed" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.drawing_reference || "—"}
          {r.spec_section ? ` · ${r.spec_section}` : ""}
        </div>
      </div>
      <div><Pill label={r.priority} color={pr.color} bg={pr.bg} /></div>
      <div>
        <Pill label={r.status === "Incomplete Response" ? "INCOMPLETE" : r.status} color={st.color} bg={st.bg} />
        <div style={{ ...mono, fontSize: 8, color: "var(--status-error)" }}>{r.cost_impact ? "$" : ""}</div>
        <div style={{ ...mono, fontSize: 8, color: "var(--status-warning)" }}>{r.schedule_impact ? "⏱" : ""}</div>
      </div>
      <div><Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} /></div>
      <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : diff != null && diff <= 3 ? "var(--status-warning)" : "var(--text-secondary)", fontWeight: overdue || (diff != null && diff <= 3) ? 700 : 500 }}>
        {due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        {overdue && <div style={{ fontSize: 8, color: "var(--status-error)" }}>{Math.abs(diff)}d LATE</div>}
      </div>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: daysOpen(r) > 30 ? "var(--status-error)" : daysOpen(r) > 14 ? "var(--status-warning)" : "var(--status-success)" }}>{daysOpen(r)}d</div>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: heldColor }}>{heldDays != null ? `${heldDays}d` : "—"}</div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={(e) => { e.stopPropagation(); onToggleStatus(r); }} style={actionBtn}>STATUS</button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(r); }} style={actionBtn}>EDIT</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(r); }}
          style={{
            ...actionBtn,
            border: "1px solid rgba(255,61,61,0.25)",
            background: "rgba(255,61,61,0.08)",
            color: "var(--status-error)",
          }}
        >
          DEL
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCreateMitigation(r); }}
          style={{
            ...actionBtn,
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 9,
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          MIT
        </button>
      </div>
    </div>
  );
}
