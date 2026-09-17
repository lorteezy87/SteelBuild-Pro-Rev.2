import type { ReactNode } from "react";

export type DateRisk = "neutral" | "upcoming" | "warning" | "overdue" | "unknown";

export interface DateRiskCellProps {
  label?: ReactNode;
  value?: ReactNode | null;
  risk?: DateRisk;
  detail?: ReactNode;
}

const RISK_CLASS: Record<DateRisk, string> = {
  neutral: "",
  upcoming: "cmd-text-info",
  warning: "cmd-text-warn",
  overdue: "cmd-text-danger",
  unknown: "",
};

export function DateRiskCell({
  label,
  value,
  risk = "neutral",
  detail,
}: DateRiskCellProps) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div className="sbp-date-risk-cell">
      {label ? <div className="cmd-row__meta">{label}</div> : null}
      <div
        className={RISK_CLASS[risk]}
        data-date-risk={risk}
        style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}
      >
        {hasValue ? value : "Unknown"}
      </div>
      {detail ? <div className="cmd-row__meta">{detail}</div> : null}
    </div>
  );
}
