/**
 * importProductionStatus.ts — Tekla EPM / FabSuite production-control CSV →
 * staged piece_production rows (Phase 4: file-based EPM integration, no API).
 *
 * No AI, no external service — parses client-side and returns STAGED rows for a
 * human review screen (§30: stage → review → apply; never write directly).
 * Headers are matched case-insensitively against the aliases EPM/FabSuite and
 * generic Excel exports actually emit. Rows without a piece mark are skipped
 * with a reason rather than crashing the parse.
 *
 * The shop reports production in many shapes, so the stage is resolved from
 * whatever the export carries, in priority order:
 *   1. an explicit status/stage column, mapped to a canonical stage;
 *   2. else the furthest station that has a completion date (Cut→…→Shipped);
 *   3. else a percent-complete column bucketed into a stage.
 * percent_complete uses an explicit percent column when present, otherwise the
 * canonical percent for the resolved stage. Raw per-station values are kept in
 * stage_data so nothing the customer sent is lost.
 */

import { parseCsv } from "@/lib/importRfiCsv";

// ── Canonical production stages, in shop order ───────────────────────────────
export const PRODUCTION_STAGES = [
  "Not Started",
  "Cut",
  "Fit",
  "Weld",
  "Clean",
  "Paint",
  "Shipped",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const STAGE_PERCENT: Record<ProductionStage, number> = {
  "Not Started": 0,
  Cut: 20,
  Fit: 35,
  Weld: 60,
  Clean: 70,
  Paint: 85,
  Shipped: 100,
};

export type StationDateField =
  | "cut_date"
  | "fit_date"
  | "weld_date"
  | "clean_date"
  | "paint_date"
  | "ship_date";

export type HeaderField =
  | "piece_mark"
  | "assembly_mark"
  | "status"
  | "percent_complete"
  | "quantity"
  | "weight"
  | "sequence_number"
  | "erection_area"
  | "external_ref"
  | StationDateField;

/** Column-index map for recognized headers (piece_mark always present when non-null). */
export type HeaderMap = Partial<Record<HeaderField, number>> & { piece_mark: number };

export type StageData = Partial<Record<StationDateField, string>>;

export interface ProductionFields {
  status?: string | null;
  percent_complete?: string | number | null;
  cut_date?: string | null;
  fit_date?: string | null;
  weld_date?: string | null;
  clean_date?: string | null;
  paint_date?: string | null;
  ship_date?: string | null;
}

export interface ResolvedProduction {
  status: ProductionStage | null;
  percent_complete: number | null;
  ship_date: string | null;
  stage_data: StageData | null;
}

export type StagedAction = "create" | "update";

/** One staged piece_production row ready for human review before apply. */
export interface StagedProductionRow {
  action: StagedAction;
  existing_id: string | null;
  piece_mark: string;
  assembly_mark: string | null;
  status: ProductionStage | null;
  percent_complete: number | null;
  ship_date: string | null;
  stage_data: StageData | null;
  quantity: number;
  weight: number | null;
  sequence_number: string | null;
  erection_area: string | null;
  external_ref: string | null;
}

export interface ExistingPieceProduction {
  id?: string | null;
  piece_mark?: string | null;
  is_deleted?: boolean | null;
}

export interface ParseProductionStats {
  create: number;
  update: number;
  skipped: number;
}

export interface SkippedProductionRow {
  line: number;
  reason: string;
}

export interface ParseProductionOptions {
  existing?: ExistingPieceProduction[];
}

export interface ParseProductionResult {
  ok: boolean;
  error?: string;
  rows: StagedProductionRow[];
  stats: ParseProductionStats;
  skipped: SkippedProductionRow[];
}

// Exact status text → canonical stage (compared lowercased, punctuation
// collapsed). Generic completion words map to Paint (fab complete) — NOT
// Shipped — so "Complete"/"Done" cannot jump past fabrication. Shipping requires
// an explicit ship/delivered signal. They are deliberately NOT tokens below, so
// "Weld Complete" resolves to Weld (the station), not Paint/Shipped.
const STATUS_ALIASES: Record<ProductionStage, string[]> = {
  // Exact "Complete"/"Done" mean fabrication complete (Paint), NOT shipped.
  // Shipping must be an explicit ship/delivered signal.
  Shipped: ["shipped", "ship", "delivered"],
  Paint: [
    "paint",
    "painted",
    "painting",
    "galv",
    "galvanized",
    "galvanised",
    "coat",
    "coated",
    "prime",
    "primed",
    "complete",
    "completed",
    "done",
    "finished",
    "fabricated",
  ],
  Clean: ["clean", "cleaned", "cleaning", "blast", "blasted", "shotblast", "sand", "sandblast"],
  Weld: ["weld", "welded", "welding", "fit weld", "fitweld", "assembled", "assembly"],
  Fit: ["fit", "fitted", "fitup", "fit up", "fitting", "layout"],
  Cut: ["cut", "cutting", "nest", "nested", "cnc", "burn", "burned", "sawn", "saw"],
  "Not Started": ["not started", "open", "released", "to do", "todo", "pending", "queued", "new"],
};

// Station-specific tokens for the loose contains-match. NO generic completion
// words — "X Complete" must resolve to station X. When several appear (e.g.
// "fit/weld"), the furthest-along stage wins.
type TokenStage = Exclude<ProductionStage, "Not Started">;

const STAGE_TOKENS: Record<TokenStage, string[]> = {
  Shipped: ["ship", "shipped", "delivered"],
  Paint: ["paint", "galv", "coat", "prime"],
  Clean: ["clean", "blast", "shotblast", "sand"],
  Weld: ["weld"],
  Fit: ["fitup", "fit up", "fit ", "layout"],
  Cut: ["cut", "nest", "cnc", "burn", "saw"],
};

// canonical field → header aliases (model-element importer parity + EPM terms)
const HEADER_ALIASES: Record<HeaderField, string[]> = {
  piece_mark: ["piece mark", "piecemark", "mark", "part mark", "main part mark", "member mark", "piece", "mk"],
  assembly_mark: ["assembly mark", "assembly", "assy mark", "assembly no", "assembly number", "assembly pos", "lot piece"],
  status: ["status", "stage", "production status", "current status", "station", "operation", "last operation", "routing status"],
  percent_complete: ["percent", "percent complete", "% complete", "pct", "progress", "complete pct", "completion"],
  quantity: ["qty", "quantity", "pcs", "count", "no of pieces", "number"],
  weight: ["weight", "weight kg", "weight (kg)", "weight lbs", "weight (lbs)", "total weight", "wt", "asm wt", "asm weight", "assembly weight"],
  sequence_number: ["sequence", "seq", "lot", "lot no", "phase", "sequence no", "seq lot"],
  erection_area: ["area", "erection area", "zone", "building", "bldg"],
  external_ref: ["job", "job no", "job number", "work order", "wo", "ref", "reference", "epm id"],
  // station completion dates — folded into stage_data and used to resolve stage
  cut_date: ["cut date", "cut", "cutting", "nest date", "cnc date", "cut complete"],
  fit_date: ["fit date", "fitup date", "fit-up date", "fitting", "fit complete"],
  weld_date: ["weld date", "welded date", "welding", "weld complete"],
  clean_date: ["clean date", "blast date", "clean complete"],
  paint_date: ["paint date", "painted date", "galv date", "coatings", "coating", "paint complete", "coat date"],
  ship_date: ["ship date", "shipped date", "shipping date", "ship", "jobsite", "delivery date"],
};

const STATION_FIELDS: ReadonlyArray<{ field: StationDateField; stage: ProductionStage }> = [
  { field: "cut_date", stage: "Cut" },
  { field: "fit_date", stage: "Fit" },
  { field: "weld_date", stage: "Weld" },
  { field: "clean_date", stage: "Clean" },
  { field: "paint_date", stage: "Paint" },
  { field: "ship_date", stage: "Shipped" },
];

function normalizeHeader(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[._#:()\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a header row to { canonicalField: columnIndex }. Null if no piece-mark column. */
export function detectHeaderMap(headerRow: unknown[] | null | undefined): HeaderMap | null {
  const map: Partial<Record<HeaderField, number>> = {};
  (headerRow || []).forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [HeaderField, string[]][]) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(norm)) {
        map[field] = idx;
        break;
      }
    }
  });
  return map.piece_mark !== undefined ? (map as HeaderMap) : null;
}

/** Map free-text status/stage to a canonical stage, or null if unrecognized. */
export function normalizeStage(statusText: unknown): ProductionStage | null {
  const norm = normalizeHeader(statusText);
  if (!norm) return null;
  // pass 1: exact alias match (handles "Complete"/"Done" → Paint / fab complete)
  for (const [stage, aliases] of Object.entries(STATUS_ALIASES) as [ProductionStage, string[]][]) {
    if (aliases.includes(norm)) return stage;
  }
  // pass 2: station-token contains-match; the furthest-along stage wins, so
  // "Weld Complete" → Weld and "Fit/Weld" → Weld (never Shipped via "complete").
  let best: ProductionStage | null = null;
  let bestIdx = -1;
  for (const [stage, tokens] of Object.entries(STAGE_TOKENS) as [TokenStage, string[]][]) {
    if (tokens.some((token) => norm.includes(token))) {
      const idx = PRODUCTION_STAGES.indexOf(stage);
      if (idx > bestIdx) {
        bestIdx = idx;
        best = stage;
      }
    }
  }
  return best;
}

function normKey(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/[%,#\s]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell to YYYY-MM-DD (US M/D/Y or ISO), else null. */
export function parseDateOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    let [, mm, dd, yy] = us;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function clampPercent(value: unknown): number | null {
  const n = numOrNull(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Resolve { status, percent_complete, ship_date, stage_data } for one row's
 * already-extracted fields. Exported for tests.
 */
export function resolveProduction(fields: ProductionFields): ResolvedProduction {
  // 1. station dates → stage_data + furthest-completed stage
  const stageData: StageData = {};
  let stationStage: ProductionStage | null = null;
  for (const { field, stage } of STATION_FIELDS) {
    const date = parseDateOrNull(fields[field]);
    if (date) {
      stageData[field] = date;
      stationStage = stage; // STATION_FIELDS is in order, so the last hit wins
    }
  }

  const explicitStage = normalizeStage(fields.status);
  const explicitPercent = clampPercent(fields.percent_complete);

  let status: ProductionStage | null = explicitStage || stationStage || null;
  if (!status && explicitPercent !== null) status = stageFromPercent(explicitPercent);

  let percent = explicitPercent;
  if (percent === null && status) percent = STAGE_PERCENT[status] ?? null;

  const shipDate =
    stageData.ship_date || (status === "Shipped" ? parseDateOrNull(fields.ship_date) : null) || null;

  return {
    status,
    percent_complete: percent,
    ship_date: shipDate,
    stage_data: Object.keys(stageData).length ? stageData : null,
  };
}

function stageFromPercent(percent: number): ProductionStage {
  if (percent >= 100) return "Shipped";
  if (percent >= 85) return "Paint";
  if (percent >= 70) return "Clean";
  if (percent >= 50) return "Weld";
  if (percent >= 30) return "Fit";
  if (percent > 0) return "Cut";
  return "Not Started";
}

function zeroStats(): ParseProductionStats {
  return { create: 0, update: 0, skipped: 0 };
}

/**
 * Parse an EPM/FabSuite production CSV into staged piece_production rows.
 */
export function parseProductionCsv(
  rawCsv: string,
  options: ParseProductionOptions = {},
): ParseProductionResult {
  const { existing = [] } = options;
  const grid = (parseCsv(rawCsv) as unknown[][]).filter((row) =>
    row.some((cell) => String(cell).trim() !== ""),
  );
  if (grid.length === 0) return { ok: false, error: "Empty file", rows: [], stats: zeroStats(), skipped: [] };

  const headerMap = detectHeaderMap(grid[0]);
  if (!headerMap) {
    return {
      ok: false,
      error: 'No piece-mark column found — expected a header like "Piece Mark", "Mark", or "Part Mark".',
      rows: [],
      stats: zeroStats(),
      skipped: [],
    };
  }

  const existingByMark = new Map<string, ExistingPieceProduction>();
  for (const row of existing) {
    if (!row || row.is_deleted) continue;
    const mk = normKey(row.piece_mark);
    if (mk && !existingByMark.has(mk)) existingByMark.set(mk, row);
  }

  const get = (row: unknown[], field: HeaderField): string =>
    headerMap[field] === undefined ? "" : String(row[headerMap[field]!] ?? "").trim();

  const rows: StagedProductionRow[] = [];
  const skipped: SkippedProductionRow[] = [];
  const byMark = new Map<string, StagedProductionRow>(); // markKey -> the staged row (for instance roll-up)
  const stats = zeroStats();

  for (let i = 1; i < grid.length; i += 1) {
    const raw = grid[i];
    const pieceMark = get(raw, "piece_mark");
    if (!pieceMark) {
      skipped.push({ line: i + 1, reason: "Missing piece mark" });
      stats.skipped += 1;
      continue;
    }
    const markKey = normKey(pieceMark);
    const already = byMark.get(markKey);
    if (already) {
      // Instance-level export (one row per piece instance) → roll the instance's
      // quantity into the mark's row. piece_production is one row per mark; the
      // first instance's resolved stage/dates represent the mark (instances of a
      // mark share station dates in the EPM export).
      already.quantity = (already.quantity || 0) + (numOrNull(get(raw, "quantity")) ?? 1);
      continue;
    }

    const resolved = resolveProduction({
      status: get(raw, "status"),
      percent_complete: get(raw, "percent_complete"),
      cut_date: get(raw, "cut_date"),
      fit_date: get(raw, "fit_date"),
      weld_date: get(raw, "weld_date"),
      clean_date: get(raw, "clean_date"),
      paint_date: get(raw, "paint_date"),
      ship_date: get(raw, "ship_date"),
    });

    // No production signal at all (no station date, no status, no percent) =
    // an untracked sub-component (e.g. a "-WS" weld subassembly carried only as
    // an empty row) — skip rather than import a noise "unmapped" piece.
    const hasSignal =
      resolved.status !== null || resolved.stage_data !== null || resolved.percent_complete !== null;
    if (!hasSignal) {
      stats.skipped += 1;
      continue;
    }

    const existingRow = existingByMark.get(markKey) || null;
    const action: StagedAction = existingRow ? "update" : "create";
    stats[action] += 1;

    const stagedRow: StagedProductionRow = {
      action,
      existing_id: existingRow?.id || null,
      piece_mark: pieceMark,
      assembly_mark: get(raw, "assembly_mark") || null,
      status: resolved.status,
      percent_complete: resolved.percent_complete,
      ship_date: resolved.ship_date,
      stage_data: resolved.stage_data,
      quantity: numOrNull(get(raw, "quantity")) ?? 1,
      weight: numOrNull(get(raw, "weight")),
      sequence_number: get(raw, "sequence_number") || null,
      erection_area: get(raw, "erection_area") || null,
      external_ref: get(raw, "external_ref") || null,
    };
    rows.push(stagedRow);
    byMark.set(markKey, stagedRow);
  }

  return { ok: true, rows, stats, skipped };
}
