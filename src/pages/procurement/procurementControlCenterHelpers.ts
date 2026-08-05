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

/** Tone for procurement need-by dates. */
export function needByTone(item: {
  required_date?: string | null;
}, isOverdueFn: (item: any) => boolean, daysUntilFn: (d: string) => number | null): "none" | "overdue" | "soon" | "ok" {
  if (!item.required_date) return "none";
  if (isOverdueFn(item)) return "overdue";
  const diff = daysUntilFn(item.required_date);
  if (diff !== null && diff <= 7) return "soon";
  return "ok";
}

export function needByCellStyle(
  tone: "none" | "overdue" | "soon" | "ok",
): Record<string, string | number> {
  if (tone === "none") return { color: "var(--text-muted)", fontSize: 11 };
  if (tone === "overdue") {
    return {
      color: "var(--status-error)",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      fontWeight: 700,
    };
  }
  if (tone === "soon") {
    return {
      color: "var(--status-warning)",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      fontWeight: 700,
    };
  }
  return { fontFamily: "var(--font-mono)", fontSize: 11 };
}

export function formatNeedByLabel(
  requiredDate: string | null | undefined,
  tone: "none" | "overdue" | "soon" | "ok",
  daysLateOrUntil: number,
): string {
  if (tone === "none" || !requiredDate) return "No date";
  if (tone === "overdue") return `${requiredDate} · ${daysLateOrUntil}d late`;
  if (tone === "soon") return `${requiredDate} · ${daysLateOrUntil}d`;
  return requiredDate;
}

