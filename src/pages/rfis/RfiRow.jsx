/**
 * RfiRow — single row in the RFIs list table.
 *
 * Columns: checkbox / RFI# / title+submitter / discipline / BIC /
 * status / age (color-ramped) / priority / cost-impact / actions.
 *
 * Row click opens detail; checkbox / more-actions stop propagation.
 * Critical-priority rows get a small glowing red dot before the title
 * as an affordance.
 */

import React from "react";
import { StatusPill, BicPill, Icon } from "@/components/design-system";
import { daysOpen, isOverdue, rfiStatusShortLabel } from "./utils";

export const RFI_ROW_GRID = "36px 78px 1fr 110px 100px 110px 70px 90px 110px 60px";

/**
 * `density` controls the row height + whether the submitter sub-line
 * renders. Three values: "compact" (28px, no sub-line), "normal"
 * (38px, sub-line as before), "comfortable" (50px). The page sets
 * `--density-row-height` and we read it here so the row also picks
 * up overrides from any wrapping density-driven container.
 */
export default function RfiRow({ rfi, idx, selected, onToggle, onOpen, density = "normal" }) {
  const overdue = isOverdue(rfi);
  const age = daysOpen(rfi);
  const showSubLine = density !== "compact";
  const priorityColor =
    rfi.priority === "Critical" ? "#FF6B35" :
    rfi.priority === "High"     ? "var(--status-warning)" :
    rfi.priority === "Medium"   ? "var(--status-info)" :
                                  "var(--text-muted)";

  return (
    <div
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: RFI_ROW_GRID,
        gap: 8,
        padding: "0 12px",
        alignItems: "center",
        borderBottom: "1px solid var(--divider)",
        background: selected
          ? "var(--accent-muted)"
          : idx % 2 === 1
          ? "rgba(255,255,255,0.015)"
          : "transparent",
        height: "var(--density-row-height, 38px)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = idx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent";
        }
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={onToggle} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: overdue ? "var(--danger)" : "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rfi.rfi_number || "—"}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {rfi.priority === "Critical" && (
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                background: "#FF6B35",
                boxShadow: "0 0 6px #FF6B35",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            {rfi.title || "—"}
          </span>
        </div>
        {showSubLine && (rfi.submitted_by || rfi.submitted_date) && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              marginTop: 2,
              letterSpacing: "0.06em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rfi.submitted_by || "—"}
            {rfi.submitted_date ? ` · ${rfi.submitted_date}` : ""}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-secondary)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {rfi.discipline || "—"}
      </div>
      <div>
        <BicPill bic={rfi.ball_in_court || "Contractor"} />
      </div>
      <div>
        <StatusPill label={rfiStatusShortLabel(rfi.status)} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: overdue ? "var(--danger)" : age > 7 ? "var(--status-warning)" : "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {age}d
      </div>
      <div>
        <StatusPill label={rfi.priority || "Medium"} size="xs" color={priorityColor} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: rfi.cost_impact && rfi.cost_impact_amount ? "var(--status-warning)" : "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {rfi.cost_impact && rfi.cost_impact_amount
          ? `$${Number(rfi.cost_impact_amount).toLocaleString()}`
          : "—"}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
        <Icon name="more" size={12} color="var(--text-muted)" />
      </div>
    </div>
  );
}
