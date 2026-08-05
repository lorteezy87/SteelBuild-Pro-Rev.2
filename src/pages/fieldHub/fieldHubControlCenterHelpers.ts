import { FIELD_PHASES } from "@/lib/field/fieldPhase";

export function fmtDate(iso: string | null): string {
  if (!iso || iso === "—") return "—";
  try {
    const [, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m) - 1]} ${Number(d)}`;
  } catch {
    return iso;
  }
}

export function typeTone(type: string): "danger" | "info" | "warn" | "neutral" {
  if (type === "Safety") return "danger";
  if (type === "Inspection") return "info";
  if (type === "Punchlist") return "warn";
  return "neutral";
}

export function fieldPriorityTone(
  priority: string,
): "danger" | "warn" | "neutral" {
  if (priority === "Critical" || priority === "High") return "danger";
  if (priority === "Medium") return "warn";
  return "neutral";
}

export function fieldStatusTone(
  status: string,
): "good" | "info" | "neutral" {
  if (["Closed", "Completed", "Complete"].includes(status)) return "good";
  if (["Open", "Scheduled", "In Progress"].includes(status)) return "info";
  return "neutral";
}

export const TYPE_CHIPS = ["All", "Daily Log", "Inspection", "Safety", "Punchlist"] as const;

export const PHASE_CHIPS = ["All", ...FIELD_PHASES] as const;
