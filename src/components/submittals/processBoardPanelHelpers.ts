/**
 * Pure presentation helpers for ProcessBoardPanel.
 */
export type ProcessPillTone = "good" | "warn" | "info" | "neutral" | "danger" | "review";

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

export type BoardItemLike = {
  risk?: { tier?: string | null } | null;
  due?: { overdue?: boolean; dueSoon?: boolean } | null;
  needsAction?: boolean;
};

/** Card-level tone: critical risk / overdue → danger, needs-action → review, due-soon → warn. */
export function cardTone(item: BoardItemLike): ProcessPillTone {
  if (item.risk?.tier === "critical" || item.due?.overdue) return "danger";
  if (item.risk?.tier === "urgent" || item.needsAction) return "review";
  if (item.risk?.tier === "attention" || item.due?.dueSoon) return "warn";
  return "neutral";
}

export function riskPillTone(tier: string | undefined): ProcessPillTone {
  if (tier === "critical") return "danger";
  if (tier === "urgent") return "review";
  if (tier === "attention") return "warn";
  return "neutral";
}
