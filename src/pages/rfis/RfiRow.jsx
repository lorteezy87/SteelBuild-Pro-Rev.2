import React from "react";
import { StatusPill, BicPill, Icon } from "@/components/design-system";
import { daysOpen, isOverdue, rfiStatusShortLabel, rfiDueSummary, rfiImpactSummary } from "./utils";
import {
  rfiAssignedLine,
  rfiPriorityColor,
  rfiReferenceLine,
  rfiRowClassNames,
  rfiSubmittedLine,
} from "./rfiRowHelpers";

export const RFI_ROW_GRID = "46px 108px minmax(360px, 1.45fr) minmax(156px, 0.58fr) minmax(142px, 0.5fr) minmax(148px, 0.5fr) minmax(148px, 0.5fr) 44px";

export default function RfiRow({ rfi, selected, onToggle, onOpen }) {
  const overdue = isOverdue(rfi);
  const due = rfiDueSummary(rfi);
  const impact = rfiImpactSummary(rfi);
  const reference = rfiReferenceLine(rfi);
  const submitted = rfiSubmittedLine(rfi);
  const assigned = rfiAssignedLine(rfi);
  const priorityColor = rfiPriorityColor(rfi.priority);

  return (
    <div
      className={rfiRowClassNames({ selected, overdue, priority: rfi.priority })}
      onClick={onOpen}
    >
      <div className="rfi-row-check" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={onToggle} />
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
        <StatusPill label={rfiStatusShortLabel(rfi.status)} />
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
