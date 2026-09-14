import React from "react";
import { StatusPill, BicPill, Icon } from "@/components/design-system";
import { daysOpen, isOverdue } from "./utils";
import { rfiAccentColor, rfiStatusView } from "./rfiStatus";

export const RFI_ROW_GRID = "46px 108px minmax(360px, 1.45fr) minmax(156px, 0.58fr) minmax(142px, 0.5fr) minmax(148px, 0.5fr) minmax(148px, 0.5fr) 44px";

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueSummary(rfi) {
  if (!rfi.date_required) return { primary: "No due date", secondary: `${daysOpen(rfi)}d open`, late: false };
  const overdue = isOverdue(rfi);
  return {
    primary: formatDate(rfi.date_required),
    secondary: overdue ? `${daysOpen(rfi)}d open / late` : `${daysOpen(rfi)}d open`,
    late: overdue,
  };
}

function impactSummary(rfi) {
  const m = rfi.metadata || {};
  const cost = rfi.cost_impact && rfi.cost_impact_amount
    ? `$${Number(rfi.cost_impact_amount).toLocaleString()}`
    : null;
  const schedule = rfi.schedule_impact && rfi.schedule_impact_days
    ? `${rfi.schedule_impact_days}d schedule`
    : null;
  const flags = [];
  if (m.change_order_likely) flags.push("CO likely");
  if (m.drawing_revision_required) flags.push("rev req'd");
  if (m.fab_impact) flags.push("fab");
  if (m.erection_impact) flags.push("erection");
  const primary = cost || schedule || (flags[0] || "None");
  const secondary = flags.length
    ? flags.join(" · ")
    : cost && schedule ? schedule : rfi.cost_impact || rfi.schedule_impact ? "Potential impact" : "No known impact";
  return { primary, secondary, live: Boolean(cost || schedule || flags.length || rfi.cost_impact || rfi.schedule_impact) };
}

// Memoized: the register re-renders on every selection/filter change, and
// with stable id-taking handlers only the affected rows actually re-render.
function RfiRow({ rfi, selected, onToggleSelect, onOpen }) {
  const overdue = isOverdue(rfi);
  const status = rfiStatusView(rfi.status);
  // Left edge carries urgency for open work and is absent once closed, so the
  // eye can separate live RFIs from settled ones without reading any text.
  const accent = rfiAccentColor(rfi, overdue);
  const due = dueSummary(rfi);
  const impact = impactSummary(rfi);
  const reference = [rfi.discipline, rfi.drawing_reference, rfi.spec_section].filter(Boolean).join(" / ");
  const submitted = [rfi.submitted_by, rfi.submitted_date].filter(Boolean).join(" / ");
  const assigned = rfi.assigned_to || rfi.project_name || "";
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
        <div className="rfi-row-age">{daysOpen(rfi)}d open</div>
      </div>

      <div className="rfi-row-title">
        <div className="rfi-row-title-main">
          {rfi.priority === "Critical" && <span className="rfi-priority-dot" />}
          <span className="rfi-row-title-text">{rfi.title || "Untitled RFI"}</span>
        </div>
        <div className="rfi-row-meta">
          <span>{reference || "No reference"}</span>
          {submitted && <span>{submitted}</span>}
        </div>
      </div>

      <div className="rfi-row-owner">
        <BicPill bic={rfi.ball_in_court || "Contractor"} />
        {assigned && <div className="rfi-row-owner-sub">{assigned}</div>}
      </div>

      <div className="rfi-row-status">
        {/* Colour is passed explicitly. StatusPill's auto-colour map is keyed
            on FULL status names, so passing a short label alone silently
            resolved every status to the same grey. */}
        <StatusPill
          label={status.shortLabel}
          color={status.color}
          variant={status.isClosed ? "soft" : "solid"}
        />
        <div className="rfi-row-owner-sub">
          <StatusPill label={rfi.priority || "Medium"} size="xs" color={priorityColor} />
        </div>
      </div>

      <div className="rfi-row-due">
        <div className={`rfi-row-date${due.late ? " is-late" : ""}`}>{due.primary}</div>
        <div className="rfi-row-date-sub">{due.secondary}</div>
      </div>

      <div className="rfi-row-impact-cell">
        <div className={`rfi-row-impact${impact.live ? " is-live" : ""}`}>{impact.primary}</div>
        <div className="rfi-row-impact-sub">{impact.secondary}</div>
      </div>

      <div className="rfi-row-actions" onClick={(e) => e.stopPropagation()}>
        <Icon name="more" size={13} />
      </div>
    </div>
  );
}

export default React.memo(RfiRow);
