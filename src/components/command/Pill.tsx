import type { ReactNode } from "react";

export type PillTone = "neutral" | "good" | "warn" | "danger" | "info" | "review";

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`cmd-pill cmd-pill--${tone}`}>{children}</span>;
}

export function statusTone(status?: string | null): PillTone {
  switch (status) {
    case "Open": return "warn";
    case "Under Review": return "review";
    case "Incomplete Response": return "danger";
    case "Answered": return "good";
    case "Closed": return "neutral";
    default: return "neutral";
  }
}

export function priorityTone(priority?: string | null): PillTone {
  switch (priority) {
    case "Critical": return "danger";
    case "High": return "warn";
    case "Medium": return "info";
    case "Low": return "neutral";
    default: return "neutral";
  }
}
