/**
 * importShippingList.ts — parse a Tekla EPM / FabSuite "Master Shipping List
 * w/ Pieces" report into staged loads + their pieces (Phase 4).
 *
 * The report is grouped, multi-page, and two-banded: Destination sections →
 * Load header rows (Job # / Load # / Trailer / Carrier / Qty / Weight / Ship
 * Date / Ready Date) → piece rows (Quantity / Mark / Sequence / Dimensions /
 * Length / Grade / Finish), with banner + total + page-break rows interleaved.
 * Column 4 is BOTH Load # (on load rows) and Mark (on piece rows), and column
 * 21 is BOTH Ready Date and Finish — so rows are classified by TYPE first
 * (a load row carries a job # in col 0 + a ship date; a piece row has an empty
 * col 0 + a mark + a qty) and only then read.
 *
 * Each load maps to a delivery; its pieces are the load contents (and the marks
 * shipped, with the ship date, are the terminal "Shipped" production stage).
 *
 * Pure: the caller reads the .xlsx with SheetJS and passes the array-of-arrays
 * in, so this is testable without a spreadsheet engine.
 */

export type GridCell = string | number | null | undefined;
export type Grid = GridCell[][];

export interface ParsedPiece {
  mark: string;
  quantity: number | null;
  sequence: string | null;
  dimensions: string | null;
  length: string | null;
  grade: string | null;
  finish: string | null;
}

export interface ParsedLoad {
  job_number: string;
  load_number: string | null;
  destination: string | null;
  trailer: string | null;
  carrier: string | null;
  total_qty: number | null;
  total_weight_lbs: number | null;
  ship_date: string;
  ready_date: string | null;
  tbr: string | null;
  pieces: ParsedPiece[];
}

export interface ParseShippingListStats {
  loads: number;
  pieces: number;
}

export interface ParseShippingListResult {
  ok: boolean;
  error?: string;
  loads: ParsedLoad[];
  stats: ParseShippingListStats;
}

export interface ExistingDelivery {
  id?: string;
  load_number?: string | null;
  actual_date?: string | null;
  scheduled_date?: string | null;
  expected_ship_date?: string | null;
  is_deleted?: boolean | null;
}

export type ClassifyAction = "create" | "exists";

export interface ClassifiedLoad extends ParsedLoad {
  action: ClassifyAction;
  existing_id: string | null | undefined;
}

export interface ClassifyLoadsResult {
  rows: ClassifiedLoad[];
  stats: { create: number; exists: number };
}

interface LoadCols {
  job: number;
  load: number;
  trailer: number;
  carrier: number;
  qty: number;
  weight: number;
  ship: number;
  tbr: number;
  ready: number;
}

interface PieceCols {
  qty: number;
  mark: number;
  sequence: number;
  dimensions: number;
  length: number;
  grade: number;
  finish: number;
}

const norm = (v: unknown): string => String(v == null ? "" : v).trim();
const normLabel = (v: unknown): string =>
  norm(v).toLowerCase().replace(/[.#]/g, "").replace(/\s+/g, " ").trim();

/** "10/6/2025" / ISO → YYYY-MM-DD, else null. */
export function parseShipDate(value: unknown): string | null {
  const s = norm(value);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  return null;
}

/** "3,454#" → 3454 ; "" → null. */
export function parseWeight(value: unknown): number | null {
  const s = norm(value).replace(/[#,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const numOrNull = (v: unknown): number | null => {
  const s = norm(v).replace(/[,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Find a column index by matching any of the given normalized labels in a row.
function findCol(row: GridCell[], labels: string[]): number {
  for (let i = 0; i < row.length; i += 1) {
    if (labels.includes(normLabel(row[i]))) return i;
  }
  return -1;
}

function detectColumns(grid: Grid): { loadCols: LoadCols; pieceCols: PieceCols } {
  const loadCols: LoadCols = { job: 0, load: 4, trailer: 7, carrier: 9, qty: 14, weight: 16, ship: 17, tbr: 19, ready: 21 };
  const pieceCols: PieceCols = { qty: 2, mark: 4, sequence: 8, dimensions: 10, length: 15, grade: 18, finish: 21 };
  for (let i = 0; i < Math.min(grid.length, 60); i += 1) {
    const row = grid[i];
    const labels = row.map(normLabel);
    if (labels.includes("load") || labels.includes("load no")) {
      const c = (names: string[], fb: number): number => {
        const x = findCol(row, names);
        return x >= 0 ? x : fb;
      };
      loadCols.job = c(["job", "job no"], loadCols.job);
      loadCols.load = c(["load", "load no"], loadCols.load);
      loadCols.trailer = c(["trailer", "trailer no"], loadCols.trailer);
      loadCols.carrier = c(["carrier"], loadCols.carrier);
      loadCols.qty = c(["qty"], loadCols.qty);
      loadCols.weight = c(["weight"], loadCols.weight);
      loadCols.ship = c(["ship date"], loadCols.ship);
      loadCols.tbr = c(["tbr"], loadCols.tbr);
      loadCols.ready = c(["ready date"], loadCols.ready);
    }
    if (labels.includes("dimensions")) {
      const c = (names: string[], fb: number): number => {
        const x = findCol(row, names);
        return x >= 0 ? x : fb;
      };
      // NOTE: the "Quantity" label is merged (spans cols 1-3) while the piece
      // qty DATA lands one column right — so qty is NOT detected from the label;
      // it keeps its data-position default and a scan fallback below.
      pieceCols.mark = c(["mark"], pieceCols.mark);
      pieceCols.sequence = c(["sequence"], pieceCols.sequence);
      pieceCols.dimensions = c(["dimensions"], pieceCols.dimensions);
      pieceCols.length = c(["length"], pieceCols.length);
      pieceCols.grade = c(["grade"], pieceCols.grade);
      pieceCols.finish = c(["finish"], pieceCols.finish);
      break;
    }
  }
  return { loadCols, pieceCols };
}

/**
 * @param rows  array-of-arrays (SheetJS header:1 output)
 */
export function parseShippingList(rows: unknown): ParseShippingListResult {
  const grid: Grid = (Array.isArray(rows) ? rows : []).map((r): GridCell[] =>
    Array.isArray(r) ? (r as GridCell[]) : [],
  );
  const hasMark = grid.some((r) => r.some((c) => normLabel(c) === "mark"));
  if (!hasMark) {
    return { ok: false, error: 'Not a shipping list — no "Mark" column found.', loads: [], stats: zeroStats() };
  }

  const { loadCols, pieceCols } = detectColumns(grid);
  const cell = (row: GridCell[], i: number): string =>
    (i < 0 || i >= row.length ? "" : norm(row[i]));

  const loads: ParsedLoad[] = [];
  let destination: string | null = null;
  let current: ParsedLoad | null = null;
  const stats = zeroStats();

  for (const row of grid) {
    const col0 = cell(row, 0);

    if (/^destination\s*:/i.test(col0)) {
      destination = col0.replace(/^destination\s*:/i, "").replace(/-\s*continued\s*$/i, "").trim() || null;
      continue;
    }
    if (/^total\b/i.test(col0)) continue; // destination total line

    const shipDate = parseShipDate(cell(row, loadCols.ship));

    // LOAD row: a job # in col 0 + a real ship date.
    if (col0 && col0.toLowerCase() !== "job #" && shipDate) {
      current = {
        job_number: col0,
        load_number: cell(row, loadCols.load) || null,
        destination,
        trailer: cell(row, loadCols.trailer) || null,
        carrier: cell(row, loadCols.carrier) || null,
        total_qty: numOrNull(cell(row, loadCols.qty)),
        total_weight_lbs: parseWeight(cell(row, loadCols.weight)),
        ship_date: shipDate,
        ready_date: parseShipDate(cell(row, loadCols.ready)),
        tbr: cell(row, loadCols.tbr) || null,
        pieces: [],
      };
      loads.push(current);
      stats.loads += 1;
      continue;
    }

    // PIECE row: empty col 0 + a real mark (not the "Mark" header label).
    const mark = cell(row, pieceCols.mark);
    if (!col0 && mark && normLabel(mark) !== "mark" && current) {
      // qty sits just left of the mark (merged-cell offset) — take the data
      // default, else scan the cells before the mark for the first number.
      let qty = numOrNull(cell(row, pieceCols.qty));
      if (qty === null) {
        for (let c = pieceCols.mark - 1; c >= 0; c -= 1) {
          const n = numOrNull(cell(row, c));
          if (n !== null) { qty = n; break; }
        }
      }
      current.pieces.push({
        mark,
        quantity: qty,
        sequence: cell(row, pieceCols.sequence) || null,
        dimensions: cell(row, pieceCols.dimensions) || null,
        length: cell(row, pieceCols.length) || null,
        grade: cell(row, pieceCols.grade) || null,
        finish: cell(row, pieceCols.finish) || null,
      });
      stats.pieces += 1;
    }
  }

  return { ok: true, loads, stats };
}

function zeroStats(): ParseShippingListStats {
  return { loads: 0, pieces: 0 };
}

/**
 * Classify parsed loads as create vs already-imported, matched on
 * (load_number, ship date) against existing deliveries — so re-importing the
 * master list doesn't duplicate loads. Pure; returns staged rows + stats.
 */
export function classifyLoads(
  loads: ParsedLoad[] | null | undefined,
  existingDeliveries: ExistingDelivery[] = [],
): ClassifyLoadsResult {
  const seen = new Map<string, ExistingDelivery>();
  for (const d of existingDeliveries) {
    if (!d || d.is_deleted) continue;
    const date = String(d.actual_date || d.scheduled_date || d.expected_ship_date || "").slice(0, 10);
    const key = `${String(d.load_number || "").trim().toUpperCase()}|${date}`;
    if (d.load_number) seen.set(key, d);
  }
  let create = 0;
  let exists = 0;
  const rows = (loads || []).map((l): ClassifiedLoad => {
    const key = `${String(l.load_number || "").trim().toUpperCase()}|${l.ship_date || ""}`;
    const existing = seen.get(key) || null;
    const action: ClassifyAction = existing ? "exists" : "create";
    if (existing) exists += 1; else create += 1;
    return { ...l, action, existing_id: existing ? existing.id : null };
  });
  return { rows, stats: { create, exists } };
}
