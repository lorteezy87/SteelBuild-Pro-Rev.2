/**
 * Pure coerce / manning / link-option helpers for DailyLogForm.
 */
import { asArray, asObject } from "@/lib/coerce";
export { asArray, asObject };

export const MANNING_TRADES = [
  "Ironworkers",
  "Welders",
  "Operators",
  "Laborers",
  "Foremen",
  "Other",
] as const;

export type ManningTrade = (typeof MANNING_TRADES)[number];

export type ManningRow = { count: number | string; hours: number | string };

export type ManningMap = Record<string, ManningRow>;

export function emptyManning(): ManningMap {
  return MANNING_TRADES.reduce((acc, trade) => {
    acc[trade] = { count: 0, hours: 0 };
    return acc;
  }, {} as ManningMap);
}

export function mergeManning(metadata: unknown): ManningMap {
  return {
    ...emptyManning(),
    ...(asObject(asObject(metadata).manning) as ManningMap),
  };
}

export function sumManningTotals(manning: ManningMap): {
  totalCount: number;
  totalHours: number;
} {
  let totalCount = 0;
  let totalHours = 0;
  for (const trade of MANNING_TRADES) {
    const row = manning[trade] || { count: 0, hours: 0 };
    const c = Number(row.count) || 0;
    const h = Number(row.hours) || 0;
    totalCount += c;
    totalHours += c * h;
  }
  return { totalCount, totalHours };
}

export type LinkOption = { id: string; label: string; sublabel: string };

export function buildActionItemOptions(
  actionItems: Array<{
    id?: string | null;
    title?: string | null;
    description?: string | null;
    status?: string | null;
  }> | null | undefined,
): LinkOption[] {
  return (actionItems || []).map((a) => ({
    id: a.id as string,
    label: a.title || a.description?.slice(0, 40) || `Item ${a.id?.slice(0, 6)}`,
    sublabel: a.status || "",
  }));
}

export function buildDeliveryOptions(
  deliveries: Array<{
    id?: string | null;
    delivery_number?: string | null;
    description?: string | null;
    status?: string | null;
  }> | null | undefined,
): LinkOption[] {
  return (deliveries || []).map((d) => ({
    id: d.id as string,
    label: d.delivery_number || d.description || `Delivery ${d.id?.slice(0, 6)}`,
    sublabel: d.status || "",
  }));
}

export function buildRfiOptions(
  rfis: Array<{
    id?: string | null;
    rfi_number?: string | null;
    title?: string | null;
    status?: string | null;
  }> | null | undefined,
): LinkOption[] {
  return (rfis || []).map((r) => ({
    id: r.id as string,
    label: r.rfi_number || r.title || `RFI ${r.id?.slice(0, 6)}`,
    sublabel: r.title && r.rfi_number ? r.title : r.status || "",
  }));
}

export const inputStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const labelStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};
