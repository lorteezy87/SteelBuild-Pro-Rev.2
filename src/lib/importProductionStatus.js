/**
 * importProductionStatus.js — Tekla EPM / FabSuite production-control CSV →
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
export const PRODUCTION_STAGES = ["Not Started", "Cut", "Fit", "Weld", "Clean", "Paint", "Shipped"];

export const STAGE_PERCENT = {
  "Not Started": 0,
  Cut: 20,
  Fit: 35,
  Weld: 60,
  Clean: 70,
  Paint: 85,
  Shipped: 100,
};

// Exact status text → canonical stage (compared lowercased, punctuation
// collapsed). The generic completion words live here so a cell that is exactly
// "Complete"/"Done" reads as Shipped — but they are deliberately NOT tokens
// below, so "Weld Complete" resolves to Weld (the station), not Shipped.
const STATUS_ALIASES = {
  Shipped: ["shipped", "ship", "complete", "completed", "done", "delivered", "finished"],
  Paint: ["paint", "painted", "painting", "galv", "galvanized", "galvanised", "coat", "coated", "prime", "primed"],
  Clean: ["clean", "cleaned", "cleaning", "blast", "blasted", "shotblast", "sand", "sandblast"],
  Weld: ["weld", "welded", "welding", "fit weld", "fitweld", "assembled", "assembly"],
  Fit: ["fit", "fitted", "fitup", "fit up", "fitting", "layout"],
  Cut: ["cut", "cutting", "nest", "nested", "cnc", "burn", "burned", "sawn", "saw"],
  "Not Started": ["not started", "open", "released", "to do", "todo", "pending", "queued", "new"],
};

// Station-specific tokens for the loose contains-match. NO generic completion
// words — "X Complete" must resolve to station X. When several appear (e.g.
// "fit/weld"), the furthest-along stage wins.
const STAGE_TOKENS = {
  Shipped: ["ship", "shipped", "delivered"],
  Paint: ["paint", "galv", "coat", "prime"],
  Clean: ["clean", "blast", "shotblast", "sand"],
  Weld: ["weld"],
  Fit: ["fitup", "fit up", "fit ", "layout"],
  Cut: ["cut", "nest", "cnc", "burn", "saw"],
};

// canonical field → header aliases (model-element importer parity + EPM terms)
const HEADER_ALIASES = {
  piece_mark: ["piece mark", "piecemark", "mark", "part mark", "main part mark", "member mark", "piece", "mk"],
  assembly_mark: ["assembly mark", "assembly", "assy mark", "assembly no", "assembly number", "assembly pos", "lot piece"],
  status: ["status", "stage", "production status", "current status", "station", "operation", "last operation", "routing status"],
  percent_complete: ["percent", "percent complete", "% complete", "pct", "progress", "complete pct", "completion"],
  quantity: ["qty", "quantity", "pcs", "count", "no of pieces", "number"],
  weight: ["weight", "weight kg", "weight (kg)", "weight lbs", "weight (lbs)", "total weight", "wt"],
  sequence_number: ["sequence", "seq", "lot", "lot no", "phase", "sequence no"],
  erection_area: ["area", "erection area", "zone", "building", "bldg"],
  external_ref: ["job", "job no", "job number", "work order", "wo", "ref", "reference", "epm id"],
  // station completion dates — folded into stage_data and used to resolve stage
  cut_date: ["cut date", "cut", "nest date", "cnc date", "cut complete"],
  fit_date: ["fit date", "fitup date", "fit-up date", "fit complete"],
  weld_date: ["weld date", "welded date", "weld complete"],
  clean_date: ["clean date", "blast date", "clean complete"],
  paint_date: ["paint date", "painted date", "galv date", "paint complete", "coat date"],
  ship_date: ["ship date", "shipped date", "shipping date", "ship", "delivery date"],
};

const STATION_FIELDS = [
  { field: "cut_date", stage: "Cut" },
  { field: "fit_date", stage: "Fit" },
  { field: "weld_date", stage: "Weld" },
  { field: "clean_date", stage: "Clean" },
  { field: "paint_date", stage: "Paint" },
  { field: "ship_date", stage: "Shipped" },
];

function normalizeHeader(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[._#:()\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a header row to { canonicalField: columnIndex }. Null if no piece-mark column. */
export function detectHeaderMap(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(norm)) {
        map[field] = idx;
        break;
      }
    }
  });
  return map.piece_mark !== undefined ? map : null;
}

/** Map free-text status/stage to a canonical stage, or null if unrecognized. */
export function normalizeStage(statusText) {
  const norm = normalizeHeader(statusText);
  if (!norm) return null;
  // pass 1: exact alias match (handles "Complete"/"Done" → Shipped)
  for (const [stage, aliases] of Object.entries(STATUS_ALIASES)) {
    if (aliases.includes(norm)) return stage;
  }
  // pass 2: station-token contains-match; the furthest-along stage wins, so
  // "Weld Complete" → Weld and "Fit/Weld" → Weld (never Shipped via "complete").
  let best = null;
  let bestIdx = -1;
  for (const [stage, tokens] of Object.entries(STAGE_TOKENS)) {
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

function normKey(value) {
  return String(value || "").trim().toUpperCase();
}

function numOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/[%, ]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell to YYYY-MM-DD (US M/D/Y or ISO), else null. */
export function parseDateOrNull(value) {
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

function clampPercent(value) {
  const n = numOrNull(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Resolve { status, percent_complete, ship_date, stage_data } for one row's
 * already-extracted fields. Exported for tests.
 */
export function resolveProduction(fields) {
  // 1. station dates → stage_data + furthest-completed stage
  const stageData = {};
  let stationStage = null;
  for (const { field, stage } of STATION_FIELDS) {
    const date = parseDateOrNull(fields[field]);
    if (date) {
      stageData[field] = date;
      stationStage = stage; // STATION_FIELDS is in order, so the last hit wins
    }
  }

  const explicitStage = normalizeStage(fields.status);
  const explicitPercent = clampPercent(fields.percent_complete);

  let status = explicitStage || stationStage || null;
  if (!status && explicitPercent !== null) status = stageFromPercent(explicitPercent);

  let percent = explicitPercent;
  if (percent === null && status) percent = STAGE_PERCENT[status] ?? null;

  const shipDate = stageData.ship_date || (status === "Shipped" ? parseDateOrNull(fields.ship_date) : null) || null;

  return {
    status,
    percent_complete: percent,
    ship_date: shipDate,
    stage_data: Object.keys(stageData).length ? stageData : null,
  };
}

function stageFromPercent(percent) {
  if (percent >= 100) return "Shipped";
  if (percent >= 85) return "Paint";
  if (percent >= 70) return "Clean";
  if (percent >= 50) return "Weld";
  if (percent >= 30) return "Fit";
  if (percent > 0) return "Cut";
  return "Not Started";
}

function zeroStats() {
  return { create: 0, update: 0, skipped: 0 };
}

/**
 * Parse an EPM/FabSuite production CSV into staged piece_production rows.
 *
 * @param {string} rawCsv
 * @param {object} [options]
 * @param {Array}  [options.existing] — current piece_production rows for the
 *   project; a matching piece mark becomes an `update` instead of a `create`.
 * @returns {{ ok, error?, rows, stats, skipped }}
 */
export function parseProductionCsv(rawCsv, options = {}) {
  const { existing = [] } = options;
  const grid = parseCsv(rawCsv).filter((row) => row.some((cell) => String(cell).trim() !== ""));
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

  const existingByMark = new Map();
  for (const row of existing) {
    if (!row || row.is_deleted) continue;
    const mk = normKey(row.piece_mark);
    if (mk && !existingByMark.has(mk)) existingByMark.set(mk, row);
  }

  const get = (row, field) => (headerMap[field] === undefined ? "" : String(row[headerMap[field]] ?? "").trim());

  const rows = [];
  const skipped = [];
  const seenMarks = new Set();
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
    if (seenMarks.has(markKey)) {
      skipped.push({ line: i + 1, reason: `Duplicate piece mark in file: ${pieceMark}` });
      stats.skipped += 1;
      continue;
    }
    seenMarks.add(markKey);

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

    const existingRow = existingByMark.get(markKey) || null;
    const action = existingRow ? "update" : "create";
    stats[action] += 1;

    rows.push({
      action,
      existing_id: existingRow?.id || null,
      piece_mark: pieceMark,
      assembly_mark: get(raw, "assembly_mark") || null,
      status: resolved.status,
      percent_complete: resolved.percent_complete,
      ship_date: resolved.ship_date,
      stage_data: resolved.stage_data,
      quantity: numOrNull(get(raw, "quantity")),
      weight: numOrNull(get(raw, "weight")),
      sequence_number: get(raw, "sequence_number") || null,
      erection_area: get(raw, "erection_area") || null,
      external_ref: get(raw, "external_ref") || null,
    });
  }

  return { ok: true, rows, stats, skipped };
}
