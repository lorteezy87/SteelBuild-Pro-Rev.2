export type PanelTone = "danger" | "warn" | "good" | "neutral";
export type PillTone = "danger" | "warn" | "good" | "neutral" | "info";

export function urgencyTone(u: string | null | undefined): PanelTone {
  switch (u) {
    case "overdue":
      return "danger";
    case "blocking":
      return "danger";
    case "due-soon":
      return "warn";
    case "awaiting":
      return "neutral";
    default:
      return "neutral";
  }
}

export function panelToneToPillTone(t: PanelTone): PillTone {
  switch (t) {
    case "danger":
      return "danger";
    case "warn":
      return "warn";
    case "good":
      return "good";
    default:
      return "neutral";
  }
}
