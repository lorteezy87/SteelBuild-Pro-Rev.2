/**
 * importDrawingLog.js — parse a steel-detailer Drawing Log (Complete /
 * Submittal / Transmittal) spreadsheet into staged drawing-register rows.
 *
 * These logs (one row per sheet, grouped by category) are the detailer's
 * authoritative drawing register + submittal tracking — sheet number, title,
 * revision, the date sent for approval, the date issued for fab/field, and the
 * detailer/checker initials. This parser turns the messy sheet (metadata banner
 * rows, a header row, category section rows, then data rows) into clean staged
 * rows for a §30 human review screen; nothing writes here.
 *
 * Pure: the caller (the modal) reads the .xls/.xlsx with SheetJS and passes the
 * array-of-arrays in, so this is testable without a spreadsheet engine.
 */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a log date cell — "14-Nov-25", ISO, or US M/D/Y — to YYYY-MM-DD, else null. */
export function parseLogDate(value) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let year = Number(m[3]);
    if (mon) {
      if (year < 100) year += 2000;
      return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  return null;
}

const normHeader = (v) => String(v == null ? "" : v).toLowerCase().replace(/[._/]+/g, " ").replace(/\s+/g, " ").trim();

function findHeaderRow(grid) {
  for (let i = 0; i < Math.min(grid.length, 20); i += 1) {
    const cells = (grid[i] || []).map(normHeader);
    if (cells.includes("drawing no") || cells.includes("drawing number") || cells.includes("sheet no")) return i;
  }
  return -1;
}

function colIndex(header, names) {
  const cells = header.map(normHeader);
  for (const n of names) {
    const i = cells.indexOf(n);
    if (i >= 0) return i;
  }
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] && names.some((n) => cells[i].includes(n))) return i;
  }
  return -1;
}

function zeroStats() {
  return { total: 0, skipped: 0, categories: 0 };
}

/**
 * @param {Array<Array<any>>} rows  array-of-arrays (SheetJS header:1 output)
 * @returns {{ ok, error?, rows, stats, skipped }}
 */
export function parseDrawingLog(rows) {
  const grid = (Array.isArray(rows) ? rows : []).map((r) => (Array.isArray(r) ? r : []));
  const h = findHeaderRow(grid);
  if (h < 0) {
    return { ok: false, error: 'No header row found — expected a "Drawing No" column.', rows: [], stats: zeroStats(), skipped: [] };
  }
  const header = grid[h];
  const ci = {
    desc: colIndex(header, ["description", "drawing title", "title"]),
    dwg: colIndex(header, ["drawing no", "drawing number", "sheet no", "sheet number"]),
    rev: colIndex(header, ["rev", "revision"]),
    approval: colIndex(header, ["date sent of approval", "date of approval", "approval", "submitted"]),
    fab: colIndex(header, ["date sent of fab field", "date sent of fab/field", "fab field", "issued", "ifc"]),
    remark: colIndex(header, ["remark"]),
    det: colIndex(header, ["det", "detailer"]),
    chk: colIndex(header, ["chk", "checker"]),
    size: colIndex(header, ["sheet size", "size"]),
    revRemark: colIndex(header, ["rev remark", "revision remark"]),
  };
  const cell = (row, i) => (i < 0 || i >= row.length ? "" : String(row[i] == null ? "" : row[i]).trim());

  const out = [];
  const skipped = [];
  const seen = new Set();
  const stats = zeroStats();
  let category = null;

  for (let i = h + 1; i < grid.length; i += 1) {
    const row = grid[i];
    if (!row.some((c) => String(c).trim() !== "")) continue; // blank line
    const dwg = cell(row, ci.dwg);

    if (!dwg) {
      // A text row without a drawing number is a category/section header — but
      // not a stray numeric cell (e.g. an orphan S.N) or a tiny token.
      const text = cell(row, ci.desc) || cell(row, 0) || cell(row, 1);
      if (text && !/^\d+$/.test(text) && text.length > 2) { category = text; stats.categories += 1; }
      continue;
    }

    const key = dwg.toUpperCase();
    if (seen.has(key)) {
      skipped.push({ line: i + 1, reason: `Duplicate sheet number: ${dwg}` });
      stats.skipped += 1;
      continue;
    }
    seen.add(key);

    out.push({
      sheet_number: dwg,
      title: cell(row, ci.desc) || null,
      revision_number: cell(row, ci.rev) || null,
      category: category || null,
      submitted_date: parseLogDate(cell(row, ci.approval)),
      issued_date: parseLogDate(cell(row, ci.fab)),
      detailer: cell(row, ci.det) || null,
      checker: cell(row, ci.chk) || null,
      sheet_size: cell(row, ci.size) || null,
      remark: cell(row, ci.remark) || null,
      rev_remark: cell(row, ci.revRemark) || null,
    });
  }

  stats.total = out.length;
  return { ok: true, rows: out, stats, skipped };
}

/**
 * Classify parsed log rows as create/update against existing project drawings,
 * matched on normalized sheet number. Pure; returns staged rows + stats.
 */
export function classifyDrawingRows(logRows, existingDrawings = []) {
  const byNumber = new Map();
  for (const d of existingDrawings) {
    if (!d || d.is_deleted) continue;
    const key = String(d.sheet_number || "").trim().toUpperCase();
    if (key && !byNumber.has(key)) byNumber.set(key, d);
  }
  const rows = [];
  let create = 0;
  let update = 0;
  for (const r of logRows || []) {
    const existing = byNumber.get(String(r.sheet_number).trim().toUpperCase()) || null;
    const action = existing ? "update" : "create";
    if (existing) update += 1; else create += 1;
    rows.push({ ...r, action, existing_id: existing ? existing.id : null });
  }
  return { rows, stats: { create, update } };
}
