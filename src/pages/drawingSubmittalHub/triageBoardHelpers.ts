import type { CSSProperties } from "react";
import { border, textMuted } from "./format";
/** Pure chrome constants for Detailing triage board panels. */

export const ELEMENT_BUCKET_ORDER = [
  "rfi_blocked",
  "behind_schedule",
  "in_detailing",
  "in_review",
  "fab_ready",
  "erection_ready",
  "unmapped",
] as const;

export const DRILLDOWN_ROW_CAP = 100;

export const SCHEDULE_ROWS: Array<[string, string]> = [
  ["detailingStart", "Detailing start"],
  ["internalReviewDue", "Internal review"],
  ["submitBy", "Submit by"],
  ["approvalNeededBy", "Approval by"],
  ["fabReleaseRequiredBy", "Fab release by"],
  ["erectionReleaseRequiredBy", "Erection release by"],
];


export const DRILL_TH_STYLE: CSSProperties = {
  textAlign: "left",
  padding: "7px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: textMuted,
  borderBottom: `1px solid ${border}`,
};

export const DRILL_TD_STYLE: CSSProperties = {
  padding: "6px 12px",
  borderBottom: `1px solid ${border}`,
  color: "var(--text-secondary)",
};

