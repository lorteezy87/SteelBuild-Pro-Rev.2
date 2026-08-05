export type ProcTone = "good" | "info" | "warn" | "neutral" | "danger";

export function procStatusTone(status: string | null | undefined): ProcTone {
  switch (status) {
    case "Received":
      return "good";
    case "Shipped":
      return "info";
    case "In Production":
      return "info";
    case "Confirmed":
      return "info";
    case "PO Issued":
      return "warn";
    case "Quoted":
      return "warn";
    case "Identified":
      return "neutral";
    case "Cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}
