/**
 * Pure helpers for Steel Weight Calculator.
 */
import { parseLength, ticksToDecimalFeet, formatLength } from "@/utils/lengthMath";
import {
  findShape,
  computeDynamicLbPerFt,
} from "@/data/aiscShapes";
import { pieceCost } from "@/utils/steelCost";

export const LS_RATE = "calc:steelweight:rate";
export const LS_UNIT = "calc:steelweight:unit";
export const LS_ROWS = "calc:steelweight:rows";

export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const LENGTH_MODES = {
  FT_IN: "ft-in",
  DECIMAL: "decimal",
} as const;

export function parseLengthFeet(raw: unknown, mode: string): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  if (mode === LENGTH_MODES.DECIMAL) {
    const n = parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Default: feet-inches mode. parseLength returns 32nd-inch ticks.
  const ticks = parseLength(raw as string);
  if (ticks == null || ticks <= 0) return null;
  return ticksToDecimalFeet(ticks);
}

export function readLS(key: string, fallback: string): string {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeLS(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private-mode — ignore */
  }
}

export function readRows(): unknown[] {
  try {
    const raw = window.localStorage.getItem(LS_ROWS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist running-total rows to localStorage. */
export function writeRows(rows: unknown[]): void {
  writeLS(LS_ROWS, JSON.stringify(rows || []));
}

/** Prefer saved unit when it is in the allowed list. */
export function resolveCostUnit(saved: string, units: readonly string[]): string {
  return (units as readonly string[]).includes(saved) ? saved : units[0];
}

/** CSV-cell escaping: wrap in quotes + double any embedded quotes when needed. */
export function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parsePositiveRate(rate: string): number {
  const n = parseFloat(rate);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeWeightTotals(lbPerFt: number, lengthFt: number, qty: number) {
  const piece = lbPerFt * lengthFt;
  const total = piece * qty;
  return { piece, total };
}

export function buildTakeoffCsv(
  runningTotal: Array<{
    shape?: string;
    qty?: number;
    lengthDisplay?: string | number;
    lbPerFt?: number;
    totalWeight?: number;
    cost?: number | null;
  }>,
): string {
  const header = ["shape", "qty", "length", "lb_per_ft", "weight_lb", "cost"];
  const lines = [header.join(",")];
  for (const r of runningTotal) {
    lines.push(
      [
        csvCell(r.shape),
        csvCell(r.qty),
        csvCell(r.lengthDisplay),
        csvCell((r.lbPerFt ?? 0).toFixed(3)),
        csvCell((r.totalWeight ?? 0).toFixed(2)),
        csvCell((Number(r.cost) || 0).toFixed(2)),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export type ShapeFamily = {
  key: string;
  dynamic?: string;
  shapes?: Array<{ designation: string; weightPerFoot: number }>;
  label?: string;
};

/** Resolve lb/ft for the current family/designation/dimensions. */
export function resolveCurrentLbPerFt(input: {
  family: ShapeFamily;
  designation: string;
  plateThickness: string;
  plateWidth: string;
  roundDiameter: string;
  squareSide: string;
  flatThickness: string;
  flatWidth: string;
}): number | null {
  const { family, designation } = input;
  if (!family.dynamic) {
    const row = findShape(designation);
    return row ? row.weightPerFoot : null;
  }
  switch (family.dynamic) {
    case "plate":
      return computeDynamicLbPerFt("plate", {
        thickness: parseFloat(input.plateThickness),
        width: parseFloat(input.plateWidth),
      });
    case "round-bar":
      return computeDynamicLbPerFt("round-bar", {
        diameter: parseFloat(input.roundDiameter),
      });
    case "square-bar":
      return computeDynamicLbPerFt("square-bar", {
        side: parseFloat(input.squareSide),
      });
    case "flat-bar":
      return computeDynamicLbPerFt("flat-bar", {
        thickness: parseFloat(input.flatThickness),
        width: parseFloat(input.flatWidth),
      });
    default:
      return null;
  }
}

export function buildShapeLabel(input: {
  family: ShapeFamily;
  designation: string;
  plateThickness: string;
  plateWidth: string;
  roundDiameter: string;
  squareSide: string;
  flatThickness: string;
  flatWidth: string;
}): string {
  const { family, designation } = input;
  if (!family.dynamic) return designation || "—";
  switch (family.dynamic) {
    case "plate":
      if (!input.plateThickness || !input.plateWidth) return "PL";
      return `PL ${input.plateThickness}" × ${input.plateWidth}"`;
    case "round-bar":
      if (!input.roundDiameter) return "Round Bar";
      return `Ø${input.roundDiameter}" Round`;
    case "square-bar":
      if (!input.squareSide) return "Square Bar";
      return `${input.squareSide}" Square`;
    case "flat-bar":
      if (!input.flatThickness || !input.flatWidth) return "Flat Bar";
      return `FB ${input.flatThickness}" × ${input.flatWidth}"`;
    default:
      return "—";
  }
}

export type CalcSuccess = {
  shape: string;
  lbPerFt: number;
  lengthFt: number;
  lengthDisplay: string;
  qty: number;
  pieceWeight: number;
  totalWeight: number;
  totalTons: number;
  cost: number;
};

export function tryCalculateWeight(input: {
  lbPerFt: number | null;
  lengthRaw: string;
  lengthMode: string;
  qty: string;
  shapeLabel: string;
  rateNum: number;
  costUnit: string;
}): { ok: true; result: CalcSuccess } | { ok: false; error: string } {
  const lbPerFt = input.lbPerFt;
  if (!(lbPerFt != null && lbPerFt > 0)) {
    return { ok: false, error: "Enter valid shape dimensions (positive numbers only)." };
  }

  const lengthFt = parseLengthFeet(input.lengthRaw, input.lengthMode);
  if (!(lengthFt != null && lengthFt > 0)) {
    return {
      ok: false,
      error:
        input.lengthMode === LENGTH_MODES.DECIMAL
          ? "Enter a positive length (ft)."
          : "Enter a valid length, e.g. 12'-6 1/2\" or 150 (inches).",
    };
  }

  const qtyN = parseInt(input.qty, 10);
  if (!(qtyN > 0)) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }

  const { piece, total } = computeWeightTotals(lbPerFt, lengthFt, qtyN);
  const totalCost = pieceCost(total, input.rateNum, input.costUnit);

  return {
    ok: true,
    result: {
      shape: input.shapeLabel,
      lbPerFt,
      lengthFt,
      lengthDisplay:
        input.lengthMode === LENGTH_MODES.FT_IN
          ? formatLength(parseLength(input.lengthRaw), 16)
          : `${lengthFt.toFixed(4)} ft`,
      qty: qtyN,
      pieceWeight: piece,
      totalWeight: total,
      totalTons: total / 2000,
      cost: totalCost,
    },
  };
}

export function sumRunningWeight(
  rows: Array<{ totalWeight?: number }>,
): number {
  return (rows || []).reduce((sum, r) => sum + (Number(r.totalWeight) || 0), 0);
}


export type RunningTotalResult = {
  shape?: string | null;
  lbPerFt?: number | null;
  qty?: number | null;
  lengthFt?: number | null;
  lengthDisplay?: string | null;
  pieceWeight?: number | null;
  totalWeight?: number | null;
  cost?: number | null;
};

export type RunningTotalRow = RunningTotalResult & { id: string };

export function appendRunningTotalRow(
  prev: RunningTotalRow[],
  result: RunningTotalResult,
  idFactory: () => string = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): RunningTotalRow[] {
  if (!result) return prev || [];
  return [
    ...(prev || []),
    {
      id: idFactory(),
      shape: result.shape,
      lbPerFt: result.lbPerFt,
      qty: result.qty,
      lengthFt: result.lengthFt,
      lengthDisplay: result.lengthDisplay,
      pieceWeight: result.pieceWeight,
      totalWeight: result.totalWeight,
      cost: result.cost,
    },
  ];
}

export function removeRunningTotalById<T extends { id?: string }>(
  rows: T[],
  id: string,
): T[] {
  return (rows || []).filter((r) => r.id !== id);
}

/** First designation in a shape family, or empty for dynamic families. */
export function designationForFamily(
  family: { shapes?: Array<{ designation?: string }> } | null | undefined,
): string {
  return family?.shapes?.[0]?.designation || "";
}

/** Resolve family by key with fallback to first family. */
export function resolveShapeFamily<T extends { key: string }>(
  families: T[],
  familyKey: string,
): T {
  return (families || []).find((f) => f.key === familyKey) || families[0];
}

