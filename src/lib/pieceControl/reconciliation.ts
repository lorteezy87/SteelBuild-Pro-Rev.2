import { normalizePieceMark } from "./identity";

export type PieceImportSourceType =
  | "ifc"
  | "csv"
  | "kiss"
  | "powerfab_xml"
  | "fabsuite_xml"
  | "model_elements"
  | "production_status"
  | "shipping_list"
  | "manual";

export type ReconciliationDecision =
  | "new"
  | "unchanged"
  | "update_candidate"
  | "conflict"
  | "invalid";

export interface ImportPayload {
  [key: string]: unknown;
}

export interface NormalizedImportRow {
  sourceRowNumber: number;
  originalPayload: ImportPayload;
  sourceSystem: PieceImportSourceType;
  pieceMark: string;
  normalizedPieceMark: string;
  quantity: number | null;
  weightEachLbs: number | null;
  weightTotalLbs: number | null;
  profile: string | null;
  materialGrade: string | null;
  lengthInches: number | null;
  sequenceNumber: string | null;
  erectionArea: string | null;
  externalRef: string | null;
  warnings: string[];
}

export interface CanonicalPieceForReconciliation {
  id: string;
  project_id: string;
  piece_mark: string;
  normalized_piece_mark: string;
  lot_code: string;
  parent_piece_id: string | null;
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  profile: string | null;
  material_grade: string | null;
  length_inches: number | null;
  sequence_number: string | null;
  erection_area: string | null;
  external_ref: string | null;
  deleted_at?: string | null;
}

export interface ReconciledImportRow extends NormalizedImportRow {
  decision: ReconciliationDecision;
  matchedPieceId: string | null;
}

const KG_TO_LBS = 2.2046226218;

function firstValue(payload: ImportPayload, keys: string[]): unknown {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function optionalText(payload: ImportPayload, keys: string[]): string | null {
  const value = firstValue(payload, keys);
  return value === null ? null : String(value).trim();
}

function parseNumber(
  payload: ImportPayload,
  keys: string[],
  label: string,
  warnings: string[],
): number | null {
  const value = firstValue(payload, keys);
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    warnings.push(`malformed ${label}`);
    return null;
  }
  return parsed;
}

export function normalizeImportRow(
  payload: ImportPayload,
  sourceSystem: PieceImportSourceType,
  sourceRowNumber: number,
): NormalizedImportRow {
  const warnings: string[] = [];
  const pieceMark = optionalText(payload, ["piece_mark", "mark", "assembly_mark", "part_mark"]) ?? "";
  const normalizedPieceMark = normalizePieceMark(pieceMark);

  if (!normalizedPieceMark) warnings.push("missing piece mark");

  const quantityValue = firstValue(payload, ["quantity"]);
  const quantity = quantityValue === null
    ? 1
    : parseNumber(payload, ["quantity"], "quantity", warnings);
  if (quantity !== null && quantity <= 0) warnings.push("quantity must be greater than zero");

  const weightEachLbs = parseNumber(
    payload,
    ["weight_each_lbs", "unit_weight_lbs"],
    "weight each",
    warnings,
  );

  let weightTotalLbs = parseNumber(
    payload,
    ["weight_total_lbs", "total_weight_lbs"],
    "total weight",
    warnings,
  );
  if (weightTotalLbs === null) {
    const kilograms = parseNumber(payload, ["weight_kg"], "metric weight", warnings);
    if (kilograms !== null) weightTotalLbs = kilograms * KG_TO_LBS;
  }
  if (weightTotalLbs === null && sourceSystem === "production_status") {
    weightTotalLbs = parseNumber(payload, ["weight"], "total weight", warnings);
  }

  const lengthInches = parseNumber(payload, ["length_inches"], "length", warnings);
  if (weightEachLbs !== null && weightEachLbs < 0) warnings.push("weight each cannot be negative");
  if (weightTotalLbs !== null && weightTotalLbs < 0) warnings.push("total weight cannot be negative");
  if (lengthInches !== null && lengthInches < 0) warnings.push("length cannot be negative");

  return {
    sourceRowNumber,
    originalPayload: payload,
    sourceSystem,
    pieceMark,
    normalizedPieceMark,
    quantity,
    weightEachLbs,
    weightTotalLbs,
    profile: optionalText(payload, ["profile", "section", "shape"]),
    materialGrade: optionalText(payload, ["material_grade", "grade"]),
    lengthInches,
    sequenceNumber: optionalText(payload, ["sequence_number", "sequence"]),
    erectionArea: optionalText(payload, ["erection_area"]),
    externalRef: optionalText(payload, ["external_ref", "element_guid"]),
    warnings,
  };
}

export function normalizeImportRows(
  rows: ImportPayload[],
  sourceSystem: PieceImportSourceType,
): NormalizedImportRow[] {
  return rows.map((row, index) => normalizeImportRow(row, sourceSystem, index + 1));
}

function numberDiffers(current: number | null, incoming: number | null, tolerance = 0): boolean {
  if (incoming === null) return false;
  if (current === null) return true;
  return Math.abs(Number(current) - incoming) > tolerance;
}

function textDiffers(current: string | null, incoming: string | null): boolean {
  if (incoming === null) return false;
  return (current ?? "").trim().toUpperCase() !== incoming.trim().toUpperCase();
}

export function reconcileImportRows(
  rows: NormalizedImportRow[],
  canonicalPieces: CanonicalPieceForReconciliation[],
): ReconciledImportRow[] {
  const activePieces = canonicalPieces.filter((piece) => !piece.deleted_at);
  const roots = new Map(
    activePieces
      .filter((piece) => piece.lot_code === "ALL" && !piece.parent_piece_id)
      .map((piece) => [piece.normalized_piece_mark, piece]),
  );
  const marksWithChildren = new Set(
    activePieces
      .filter((piece) => piece.lot_code !== "ALL" || Boolean(piece.parent_piece_id))
      .map((piece) => piece.normalized_piece_mark),
  );
  const sourceMarkCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.normalizedPieceMark) {
      sourceMarkCounts.set(
        row.normalizedPieceMark,
        (sourceMarkCounts.get(row.normalizedPieceMark) ?? 0) + 1,
      );
    }
  }

  return rows.map((row) => {
    const warnings = [...row.warnings];
    const root = roots.get(row.normalizedPieceMark);

    if (warnings.length > 0) {
      return { ...row, warnings, decision: "invalid", matchedPieceId: root?.id ?? null };
    }

    if ((sourceMarkCounts.get(row.normalizedPieceMark) ?? 0) > 1) {
      warnings.push("duplicate source row");
      return { ...row, warnings, decision: "conflict", matchedPieceId: root?.id ?? null };
    }

    if (!root) {
      if (marksWithChildren.has(row.normalizedPieceMark)) {
        warnings.push("mark has split lots but no active ALL root");
        return { ...row, warnings, decision: "conflict", matchedPieceId: null };
      }
      return { ...row, warnings, decision: "new", matchedPieceId: null };
    }

    const changed =
      numberDiffers(Number(root.quantity), row.quantity) ||
      numberDiffers(root.weight_each_lbs, row.weightEachLbs, 0.01) ||
      numberDiffers(root.weight_total_lbs, row.weightTotalLbs, 0.01) ||
      textDiffers(root.profile, row.profile) ||
      textDiffers(root.material_grade, row.materialGrade) ||
      numberDiffers(root.length_inches, row.lengthInches, 0.01) ||
      textDiffers(root.sequence_number, row.sequenceNumber) ||
      textDiffers(root.erection_area, row.erectionArea) ||
      textDiffers(root.external_ref, row.externalRef);

    if (!changed) {
      return { ...row, warnings, decision: "unchanged", matchedPieceId: root.id };
    }

    if (marksWithChildren.has(row.normalizedPieceMark)) {
      warnings.push("automatic changes to a split lot are not allowed");
      return { ...row, warnings, decision: "conflict", matchedPieceId: root.id };
    }

    if (
      row.weightEachLbs !== null &&
      root.weight_each_lbs !== null &&
      numberDiffers(root.weight_each_lbs, row.weightEachLbs, 0.01)
    ) warnings.push("conflicting weight each");
    if (
      row.weightTotalLbs !== null &&
      root.weight_total_lbs !== null &&
      numberDiffers(root.weight_total_lbs, row.weightTotalLbs, 0.01)
    ) warnings.push("conflicting total weight");
    if (row.profile !== null && root.profile !== null && textDiffers(root.profile, row.profile)) {
      warnings.push("conflicting profile");
    }
    if (
      row.materialGrade !== null &&
      root.material_grade !== null &&
      textDiffers(root.material_grade, row.materialGrade)
    ) warnings.push("conflicting material grade");

    return {
      ...row,
      warnings,
      decision: warnings.length > 0 ? "conflict" : "update_candidate",
      matchedPieceId: root.id,
    };
  });
}

