import React from "react";
import { StatusPill, BicPill, Icon } from "@/components/design-system";
import { daysOpen, isOverdue } from "./utils";
import { rfiAccentColor, rfiStatusView } from "./rfiStatus";

export const RFI_ROW_GRID = "46px 98px minmax(300px, 1.55fr) 104px 82px 120px minmax(142px, .62fr) minmax(138px, .62fr) 116px minmax(120px, .55fr) 44px";

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function impactSummary(rfi) {
  const m = rfi.metadata || {};
  const parts = [];
  if (rfi.cost_impact) {
    parts.push(rfi.cost_impact_amount ? `$${Number(rfi.cost_impact_amount).toLocaleString()}` : "Cost");
  }
  if (rfi.schedule_impact) {
    parts.push(rfi.schedule_impact_days ? `${rfi.schedule_impact_days}d schedule` : "Schedule");
  }
  if (m.drawing_revision_required) parts.push("Drawing rev");
  if (m.fab_hold) parts.push("Fab hold");
  else if (m.fab_impact) parts.push("Fab");
  if (m.erection_impact) parts.push("Field");
  if (m.change_order_likely) parts.push("CO likely");
  return {
    primary: parts[0] || "None",
    secondary: parts.slice(1, 3).join(" · ") || (parts.length ? "Recorded impact" : "No known impact"),
    live: parts.length > 0,
  };
}

function linkedWorkPackage(rfi) {
  if (!rfi.work_package_id) return "—";
  const value = String(rfi.work_package_id);
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function RfiRow({ rfi, selected, onToggleSelect, onOpen }) {
  const overdue = isOverdue(rfi);
  const status = rfiStatusView(rfi.status);
  const accent = rfiAccentColor(rfi, overdue);
  const impact = impactSummary(rfi);
  const reference = [rfi.discipline, rfi.drawing_reference, rfi.spec_section].filter(Boolean).join(" / ");
  const priorityColor =
    rfi.priority === "Critical" ? "var(--status-review)" :
    rfi.priority === "High" ? "var(--status-warning)" :
    rfi.priority === "Medium" ? "var(--status-info)" :
    "var(--text-muted)";

  return (
    <div
      className={[
        "rfi-record-row",
        status.isClosed ? "is-closed" : "is-open",
        selected ? "is-selected" : "",
        overdue ? "is-overdue" : "",
        rfi.priority === "Critical" ? "is-critical" : "",
      ].filter(Boolean).join(" ")}
      style={accent ? { "--rfi-accent": accent } : undefined}
      onClick={() => onOpen(rfi)}
    >
      <div className="rfi-row-check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(rfi.id)}
          aria-label={`Select ${rfi.rfi_number || "RFI"}`}
        />
      </div>

      <div className="rfi-row-number-stack">
        <div className="rfi-row-number">{rfi.rfi_number || "RFI"}</div>
        <div className="rfi-row-owner-sub">{rfi.priority || "Medium"}</div>
      </div>

      <div className="rfi-row-title">
        <div className="rfi-row-title-main">
          {rfi.priority === "Critical" && <span className="rfi-priority-dot" />}
          <span className="rfi-row-title-text">{rfi.title || "Untitled RFI"}</span>
        </div>
        <div className="rfi-row-meta">
          <span>{reference || "No reference"}</span>
        </div>
      </div>

      <div className="rfi-row-date">
        {formatDate(rfi.submitted_date)}
      </div>

      <div className="rfi-row-date">
        {daysOpen(rfi)}d
      </div>

      <div className="rfi-row-due">
        <div className={`rfi-row-date${overdue ? " is-late" : ""}`}>
          {formatDate(rfi.date_required)}
        </div>
        <div className="rfi-row-date-sub">{overdue ? "Overdue" : rfi.date_required ? "Required by" : "Date unknown"}</div>
      </div>

      <div className="rfi-row-owner">
        <BicPill bic={rfi.ball_in_court || "Contractor"} />
        {rfi.assigned_to && <div className="rfi-row-owner-sub">{rfi.assigned_to}</div>}
      </div>

      <div className="rfi-row-impact-cell">
        <div className={`rfi-row-impact${impact.live ? " is-live" : ""}`}>{impact.primary}</div>
        <div className="rfi-row-impact-sub">{impact.secondary}</div>
      </div>

      <div className="rfi-row-owner">
        <div className="rfi-row-date">{linkedWorkPackage(rfi)}</div>
        <div className="rfi-row-owner-sub">{rfi.work_package_id ? "Linked WP" : "No linked WP"}</div>
      </div>

      <div className="rfi-row-status">
        <StatusPill
          label={status.shortLabel}
          color={status.color}
          variant={status.isClosed ? "soft" : "solid"}
        />
        <div className="rfi-row-owner-sub">
          <StatusPill label={rfi.priority || "Medium"} size="xs" color={priorityColor} />
        </div>
      </div>

      <div className="rfi-row-actions" onClick={(e) => e.stopPropagation()}>
        <Icon name="more" size={13} />
      </div>
    </div>
  );
}

export default React.memo(RfiRow);
