/**
 * Presentational pieces for Punchlist page.
 */
// @ts-nocheck
import React from "react";
import { Button, KpiTile, ProgressBar } from "@/components/design-system";
import {
  PUNCHLIST_STATUSES,
  PUNCHLIST_CATEGORIES,
  PUNCHLIST_PRIORITIES,
} from "./punchlistPageHelpers";
import { pageFilterChipStyle } from "@/components/shared/pageFilterChipHelpers";
/** Presentational close-out signature modal for Punchlist. */
export function CloseoutSignatureModal({ count, signature, onSignatureChange, onCancel, onConfirm, isSaving }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: 24,
        maxWidth: 480,
        width: "92%",
      }}>
        <h3 style={{
          fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
          margin: "0 0 14px", color: "var(--text-primary)",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          Close {count} Item{count === 1 ? "" : "s"}
        </h3>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5,
        }}>
          This will mark all {count} selected item{count === 1 ? "" : "s"} as Completed (100%) and stamp
          your typed name as the close-out signature. Type your name to confirm.
        </p>
        <input
          type="text"
          autoFocus
          value={signature}
          onChange={(e) => onSignatureChange(e.target.value)}
          placeholder="Your name (text signature)"
          style={{
            width: "100%",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
          disabled={isSaving}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isSaving || !signature.trim()}>
            {isSaving ? "Closing…" : "Sign & Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}


const chipStyle = pageFilterChipStyle;

export function PunchlistCompletionCard({ completionRate }) {
  return (
    <div className="sbd-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
          Project Completion
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>
          {completionRate}%
        </span>
      </div>
      <ProgressBar value={completionRate} color="var(--status-success)" height={6} />
    </div>
  );
}

export function PunchlistKpiStrip({
  stats,
  filterStatus,
  filterPriority,
  onToggleStatus,
  onTogglePriority,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)" />
      <KpiTile compact label="Completed" value={stats.completed} color="var(--status-success)"
        active={filterStatus === "Completed"} onClick={() => onToggleStatus("Completed")} />
      <KpiTile compact label="In Progress" value={stats.inProgress} color="var(--status-warning)"
        active={filterStatus === "In Progress"} onClick={() => onToggleStatus("In Progress")} />
      <KpiTile compact label="Open" value={stats.open} color="var(--status-error)"
        active={filterStatus === "Open"} onClick={() => onToggleStatus("Open")} />
      <KpiTile compact label="On Hold" value={stats.onHold} color="var(--status-review)"
        active={filterStatus === "On Hold"} onClick={() => onToggleStatus("On Hold")} />
      <KpiTile compact label="Critical" value={stats.critical} color="var(--status-error)"
        active={filterPriority === "Critical"} onClick={() => onTogglePriority("Critical")} />
    </div>
  );
}

export function PunchlistFilterBar({
  filterStatus,
  filterCategory,
  filterPriority,
  onFilterStatus,
  onFilterCategory,
  onFilterPriority,
}) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
        {["all", ...PUNCHLIST_STATUSES].map((status) => (
          <button key={status} onClick={() => onFilterStatus(status)} style={chipStyle(filterStatus === status)}>
            {status === "all" ? "All" : status.slice(0, 6)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Category:</span>
        {["all", ...PUNCHLIST_CATEGORIES.slice(0, 4)].map((cat) => (
          <button key={cat} onClick={() => onFilterCategory(cat)} style={chipStyle(filterCategory === cat)}>
            {cat === "all" ? "All" : cat.slice(0, 5)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Priority:</span>
        {["all", ...PUNCHLIST_PRIORITIES].map((pri) => (
          <button key={pri} onClick={() => onFilterPriority(pri)} style={chipStyle(filterPriority === pri)}>
            {pri === "all" ? "All" : pri}
          </button>
        ))}
      </div>
    </div>
  );
}
