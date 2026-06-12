/**
 * importModelElements.js — Tekla / SDS2 member-report CSV → staged
 * model_elements rows (Phase 0 of the Detailing Control Center BIM
 * integration).
 *
 * No AI, no external service — parses client-side and returns STAGED rows for
 * a human review screen (§30: stage → review → apply; never write directly).
 * Column headers are matched case-insensitively against the aliases each
 * detailing package actually emits (Tekla Organizer/report templates, SDS2
 * member reports, generic Excel exports). Unknown columns are ignored; rows
 * without a piece mark are skipped with a reason rather than crashing the
 * parse.
 *
 * Drawing matching is conservative (§30): an element's `drawing_no` is linked
 * to a project sheet only on an exact normalized sheet-number match; anything
 * else stays unlinked and is surfaced as such — never guessed.
 */

import { parseCsv } from "@/lib/importRfiCsv";

// ── Header detection ─────────────────────────────────────────────────
// alias → canonical field. Compared lowercased with punctuation collapsed.
const HEADER_ALIASES = {
  piece_mark: [
    "piece mark", "piecemark", "mark", "part mark", "main part mark",
    "member mark", "piece", "mk",
  ],
  assembly_mark: [
    "assembly mark", "assembly", "assy mark", "assembly no", "assembly number",
    "assembly pos",
  ],
  profile: ["profile", "section", "size", "shape", "member size"],
  material_grade: ["material", "grade", "material grade", "steel grade"],
  quantity: ["qty", "quantity", "pcs", "count", "no of pieces", "number"],
  weight_kg: [
    "weight", "weight kg", "weight (kg)", "total weight", "weight lbs",
    "weight (lbs)", "wt",
  ],
  sequence_number: ["sequence", "seq", "lot", "lot no", "phase", "sequence no"],
  erection_area: ["area", "erection area", "zone", "building", "bldg"],
  drawing_no: [
    "drawing", "dwg", "drawing no", "drawing number", "sheet", "sheet number",
    "sheet no", "detail drawing",
  ],
  element_guid: ["guid", "ifc guid", "globalid", "global id", "ifc globalid"],
};

function normalizeHeader(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[._#:()\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a CSV header row to { canonicalField: columnIndex }.
 * Exported for tests. Returns null when no piece-mark column is found
 * (the one column the import cannot proceed without).
 */
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

/** Trim/uppercase for natural-key matching ("s-101 " -> "S-101"). */
function normKey(value) {
  return String(value || "").trim().toUpperCase();
}

function numOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/[, ]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a Tekla/SDS2 member-report CSV into staged model_elements rows.
 *
 * @param {string} rawCsv — file contents
 * @param {object} [options]
 * @param {Array}  [options.drawings] — the project's drawings (sheet rows);
 *   used for conservative drawing_no → drawing_id matching. Each needs
 *   { id, sheet_number, drawing_set_id }.
 * @param {Array}  [options.existingElements] — current model_elements for the
 *   project; rows matching on piece mark (or GUID when both have one) become
 *   `update` actions instead of `create`.
 * @returns {{
 *   ok: boolean, error?: string,
 *   rows: Array<object>,   // staged rows: { action, matched_drawing_id, ...fields }
 *   stats: { create: number, update: number, skipped: number,
 *            drawingMatched: number, drawingAmbiguous: number },
 *   skipped: Array<{ line: number, reason: string }>,
 * }}
 */
export function parseModelElementsCsv(rawCsv, options = {}) {
  const { drawings = [], existingElements = [] } = options;
  const grid = parseCsv(rawCsv).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (grid.length === 0) return { ok: false, error: "Empty file", rows: [], stats: zeroStats(), skipped: [] };

  const headerMap = detectHeaderMap(grid[0]);
  if (!headerMap) {
    return {
      ok: false,
      error: "No piece-mark column found — expected a header like \"Piece Mark\", \"Mark\", or \"Part Mark\".",
      rows: [],
      stats: zeroStats(),
      skipped: [],
    };
  }

  // Sheet-number index for conservative drawing matching. Duplicate sheet
  // numbers within the project make a match AMBIGUOUS — flagged, not guessed.
  const sheetIndex = new Map(); // normKey(sheet_number) -> { drawing, dup: boolean }
  for (const d of drawings) {
    if (!d || d.is_deleted) continue;
    const key = normKey(d.sheet_number);
    if (!key) continue;
    if (sheetIndex.has(key)) sheetIndex.get(key).dup = true;
    else sheetIndex.set(key, { drawing: d, dup: false });
  }

  // Existing-element indexes: GUID wins, then piece mark.
  const existingByGuid = new Map();
  const existingByMark = new Map();
  for (const el of existingElements) {
    if (!el || el.is_deleted) continue;
    if (el.element_guid) existingByGuid.set(normKey(el.element_guid), el);
    const mk = normKey(el.piece_mark);
    if (mk && !existingByMark.has(mk)) existingByMark.set(mk, el);
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

    const guid = get(raw, "element_guid") || null;
    const drawingNo = get(raw, "drawing_no") || null;

    let matchedDrawingId = null;
    let matchedDrawingSetId = null;
    let drawingMatch = "none"; // none | matched | ambiguous
    if (drawingNo) {
      const hit = sheetIndex.get(normKey(drawingNo));
      if (hit && !hit.dup) {
        matchedDrawingId = hit.drawing.id;
        matchedDrawingSetId = hit.drawing.drawing_set_id || null;
        drawingMatch = "matched";
        stats.drawingMatched += 1;
      } else if (hit && hit.dup) {
        drawingMatch = "ambiguous";
        stats.drawingAmbiguous += 1;
      }
    }

    const existing =
      (guid && existingByGuid.get(normKey(guid))) || existingByMark.get(markKey) || null;
    const action = existing ? "update" : "create";
    stats[action] += 1;

    rows.push({
      action,
      existing_id: existing?.id || null,
      drawing_match: drawingMatch,
      piece_mark: pieceMark,
      assembly_mark: get(raw, "assembly_mark") || null,
      profile: get(raw, "profile") || null,
      material_grade: get(raw, "material_grade") || null,
      quantity: numOrNull(get(raw, "quantity")) ?? 1,
      weight_kg: numOrNull(get(raw, "weight_kg")),
      sequence_number: get(raw, "sequence_number") || null,
      erection_area: get(raw, "erection_area") || null,
      drawing_no: drawingNo,
      drawing_id: matchedDrawingId,
      drawing_set_id: matchedDrawingSetId,
      element_guid: guid,
      source: "csv",
    });
  }

  return { ok: true, rows, stats, skipped };
}

function zeroStats() {
  return { create: 0, update: 0, skipped: 0, drawingMatched: 0, drawingAmbiguous: 0 };
}
