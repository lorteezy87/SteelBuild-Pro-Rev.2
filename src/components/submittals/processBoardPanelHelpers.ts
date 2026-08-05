/**
 * Pure presentation helpers for ProcessBoardPanel.
 */
export type ProcessPillTone = "good" | "warn" | "info" | "neutral" | "danger";

/** Stage → kit Pill tone (released/IFC → good, OFS/BFA → warn, IFA/OFA → info). */
export function statusPillTone(stage: string): ProcessPillTone {
  switch (stage) {
    case "Released":
    case "IFC":
      return "good";
    case "OFS":
    case "BFA":
      return "warn";
    case "IFA":
    case "OFA":
      return "info";
    default:
      return "neutral";
  }
}
