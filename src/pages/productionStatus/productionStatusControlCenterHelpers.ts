import { PRODUCTION_STAGES } from "./productionStatusControlCenter.derive";

/** Pure chrome for ProductionStatusControlCenter. */

export const STAGE_FILTERS = ["All", ...PRODUCTION_STAGES] as const;

/** True when a non-shipped piece has a ship_date before today. */
export function isShipDateOverdue(
  status: string | null | undefined,
  shipDate: string | null | undefined,
  today: string,
): boolean {
  return Boolean(shipDate) && status !== "Shipped" && (shipDate as string) < today;
}

export function shipDateCellStyle(
  overdue: boolean,
): Record<string, string | number> {
  return overdue
    ? { color: "var(--cmd-danger)", fontWeight: 600 }
    : { fontFamily: "var(--font-mono)", fontSize: 11 };
}

export function formatShipDateLabel(
  shipDate: string,
  overdue: boolean,
): string {
  return overdue ? `${shipDate} · late` : shipDate;
}

