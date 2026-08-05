export type ProjectPillTone = "good" | "warn" | "info" | "neutral" | "danger";

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function phaseTone(phase?: string | null): ProjectPillTone {
  switch (phase) {
    case "Pre-Construction":
      return "neutral";
    case "Detailing":
      return "info";
    case "Procurement":
      return "warn";
    case "Fabrication":
      return "warn";
    case "Delivery":
      return "info";
    case "Installation":
    case "Installation/Erection":
    case "Erection":
      return "good";
    case "Closeout":
      return "neutral";
    default:
      return "neutral";
  }
}

export function healthTone(health?: string | null): ProjectPillTone {
  switch (health) {
    case "On Track":
      return "good";
    case "Watch":
      return "warn";
    case "At Risk":
      return "danger";
    default:
      return "neutral";
  }
}
