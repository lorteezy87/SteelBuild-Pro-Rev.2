/**
 * Pure helpers for Labor / Equipment / Materials (LEMs) page.
 */

export const TABS = ["LABOR", "EQUIPMENT", "MATERIALS"] as const;
export type LemTab = (typeof TABS)[number];

export function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

export function fmtDec(n: number, decimals = 1): string {
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "0.0";
}

export function pct(actual: unknown, budget: unknown): number {
  const a = safeNum(actual);
  const b = safeNum(budget);
  return b === 0 ? 0 : (a / b) * 100;
}

export function burnTone(burn: number): string {
  if (burn > 100) return "var(--status-error)";
  if (burn > 85) return "var(--status-warning)";
  return "var(--text-primary)";
}

export type WorkPackageHours = {
  shop_hours_budget?: unknown;
  shop_hours_actual?: unknown;
  field_hours_budget?: unknown;
  field_hours_actual?: unknown;
  [k: string]: unknown;
};

export type DailyLogRow = {
  headcount?: unknown;
  hours_worked?: unknown;
  equipment_used?: unknown;
  date?: string | null;
  created_date?: string | null;
  [k: string]: unknown;
};

export function computeLaborStats(
  workPackages: WorkPackageHours[],
  dailyLogs: DailyLogRow[],
) {
  const totalBudgetShop = workPackages.reduce((s, wp) => s + safeNum(wp.shop_hours_budget), 0);
  const totalActualShop = workPackages.reduce((s, wp) => s + safeNum(wp.shop_hours_actual), 0);
  const totalBudgetField = workPackages.reduce((s, wp) => s + safeNum(wp.field_hours_budget), 0);
  const totalActualField = workPackages.reduce((s, wp) => s + safeNum(wp.field_hours_actual), 0);
  const totalBudget = totalBudgetShop + totalBudgetField;
  const totalActual = totalActualShop + totalActualField;
  const burnPct = pct(totalActual, totalBudget);

  const headcounts = dailyLogs.map((l) => safeNum(l.headcount)).filter((h) => h > 0);
  const avgHeadcount =
    headcounts.length > 0 ? headcounts.reduce((a, b) => a + b, 0) / headcounts.length : 0;
  const totalLaborDays = dailyLogs.length;

  // Overtime exposure: hours worked beyond 8 per person per day
  const overtimeHrs = dailyLogs.reduce((sum, log) => {
    const hrs = safeNum(log.hours_worked);
    const hc = safeNum(log.headcount);
    if (hc === 0 || hrs === 0) return sum;
    const regularCap = hc * 8;
    return sum + Math.max(0, hrs - regularCap);
  }, 0);

  return {
    totalBudget,
    totalActual,
    burnPct,
    avgHeadcount,
    totalLaborDays,
    overtimeHrs,
    totalBudgetShop,
    totalActualShop,
    totalBudgetField,
    totalActualField,
  };
}

export function mapLaborWpRows<T extends WorkPackageHours>(workPackages: T[]) {
  return workPackages.map((wp) => {
    const bShop = safeNum(wp.shop_hours_budget);
    const aShop = safeNum(wp.shop_hours_actual);
    const bField = safeNum(wp.field_hours_budget);
    const aField = safeNum(wp.field_hours_actual);
    const totalBudget = bShop + bField;
    const totalActual = aShop + aField;
    const burn = pct(totalActual, totalBudget);
    const variance = totalBudget - totalActual;
    return { ...wp, bShop, aShop, bField, aField, totalBudget, totalActual, burn, variance };
  });
}

/** Parse a single free-text equipment entry into type + qty. */
export function parseEquipmentEntry(entry: string): { type: string; qty: number } {
  let type = entry;
  let qty = 1;

  const matchPrefix = entry.match(/^(\d+)\s*[x×-]\s*(.+)$/i);
  const matchSuffix = entry.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
  const matchParen = entry.match(/^(.+?)\s*\((\d+)\)\s*$/);

  if (matchPrefix) {
    qty = parseInt(matchPrefix[1], 10) || 1;
    type = matchPrefix[2].trim();
  } else if (matchSuffix) {
    type = matchSuffix[1].trim();
    qty = parseInt(matchSuffix[2], 10) || 1;
  } else if (matchParen) {
    type = matchParen[1].trim();
    qty = parseInt(matchParen[2], 10) || 1;
  }

  const normalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return { type: normalizedType, qty };
}

export type EquipAgg = {
  type: string;
  daysUsed: number;
  totalQty: number;
  lastDate: string;
  avgQty: number;
};

export function aggregateEquipmentFromLogs(dailyLogs: DailyLogRow[]): EquipAgg[] {
  const equipMap: Record<string, { type: string; daysUsed: number; totalQty: number; lastDate: string }> = {};

  dailyLogs.forEach((log) => {
    const raw = log.equipment_used;
    if (!raw || typeof raw !== "string" || raw.trim() === "") return;

    const logDate = log.date || log.created_date || "";
    const entries = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);

    entries.forEach((entry) => {
      const { type: normalizedType, qty } = parseEquipmentEntry(entry);
      if (!equipMap[normalizedType]) {
        equipMap[normalizedType] = { type: normalizedType, daysUsed: 0, totalQty: 0, lastDate: "" };
      }
      equipMap[normalizedType].daysUsed += 1;
      equipMap[normalizedType].totalQty += qty;
      if (logDate > equipMap[normalizedType].lastDate) {
        equipMap[normalizedType].lastDate = String(logDate);
      }
    });
  });

  return Object.values(equipMap)
    .map((e) => ({
      ...e,
      avgQty: e.daysUsed > 0 ? e.totalQty / e.daysUsed : 0,
    }))
    .sort((a, b) => b.daysUsed - a.daysUsed);
}

export type DeliveryRow = {
  status?: string | null;
  weight_tons?: unknown;
  pieces?: unknown;
  scheduled_date?: string | null;
  [k: string]: unknown;
};

export type WorkPackageTonnage = {
  tonnage?: unknown;
  [k: string]: unknown;
};

export function computeMaterialsStats(
  workPackages: WorkPackageTonnage[],
  deliveries: DeliveryRow[],
) {
  const totalTonnage = workPackages.reduce((s, wp) => s + safeNum(wp.tonnage), 0);
  const deliveredTonnage = deliveries
    .filter((d) => d.status === "Delivered")
    .reduce((s, d) => s + safeNum(d.weight_tons), 0);
  const remaining = Math.max(0, totalTonnage - deliveredTonnage);
  const deliveryPct = pct(deliveredTonnage, totalTonnage);
  const totalPieces = deliveries.reduce((s, d) => s + safeNum(d.pieces), 0);
  const deliveredPieces = deliveries
    .filter((d) => d.status === "Delivered")
    .reduce((s, d) => s + safeNum(d.pieces), 0);

  return { totalTonnage, deliveredTonnage, remaining, deliveryPct, totalPieces, deliveredPieces };
}

export function mapDeliveryRows<T extends DeliveryRow>(
  deliveries: T[],
  now: Date = new Date(),
) {
  return deliveries.map((d) => {
    const scheduled = d.scheduled_date ? new Date(d.scheduled_date) : null;
    const isLate = !!(scheduled && scheduled < now && d.status !== "Delivered");
    return { ...d, isLate };
  });
}
