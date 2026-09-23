/**
 * importSovSpreadsheet — pure parsing + steel cost-code auto-mapping helpers
 * for the SOV (Schedule of Values) importer.
 *
 * Kept free of React / xlsx so the parsing + mapping logic is unit-testable.
 * The page (src/pages/SOV.jsx) owns file reading: CSV text goes through
 * `parseCsvToAoa`, an XLSX sheet goes through SheetJS' `sheet_to_json` with
 * `{ header: 1 }`; both produce an array-of-arrays that `aoaToRows` turns into
 * canonical row objects. `buildSovStaged` then maps rows to stage-able records
 * (with validity + an auto-suggested cost code) for the pre-import review.
 */

/** A canonical-keyed spreadsheet row: header → trimmed cell text. */
export type SovRow = Record<string, string>;

/** The project cost-code columns the auto-mapper reads. */
export interface SovCostCode {
  cost_code_number: string;
  description: string;
}

export interface SovCostCodeSuggestion {
  cost_code: string;
  cost_code_name: string;
}

export type SovStatus = "Draft" | "Submitted" | "Certified" | "Paid";

/** DB fields for one sov_items insert. */
export interface SovRecord {
  sov_id: string;
  project_id: string | undefined;
  project_name: string;
  line_item_number: number;
  description: string;
  scheduled_value: number;
  cost_code: string | null;
  cost_code_name: string | null;
  application_number: number;
  period_from: string | null;
  period_to: string | null;
  previous_percent_complete: number;
  current_percent_complete: number;
  retainage_percent: number;
  status: SovStatus;
}

export interface SovStagedRow {
  record: SovRecord;
  valid: boolean;
  reason: string | null;
  autoMapped: boolean;
}

export interface BuildSovStagedOptions {
  project?: { id?: string; name?: string | null } | null;
  existingCount?: number;
  costCodes?: SovCostCode[];
}

/** Canonical SOV import columns (also the downloadable template header order). */
export const SOV_TEMPLATE_COLUMNS = [
  "line_item_number",
  "description",
  "scheduled_value",
  "cost_code",
  "application_number",
  "period_from",
  "period_to",
  "previous_percent_complete",
  "current_percent_complete",
  "retainage_percent",
  "status",
];

/** Sample rows for the downloadable template (cover a few auto-map cases). */
export const SOV_TEMPLATE_SAMPLE = [
  ["1", "Mobilization",                   "25000",  "",   "1", "2026-01-01", "2026-01-31", "0", "100", "10", "Draft"],
  ["2", "Detailing - Bldg. 1",            "60000",  "",   "1", "2026-01-01", "2026-01-31", "0", "50",  "10", "Draft"],
  ["3", "Structural Steel - Fabrication", "180000", "",   "1", "2026-01-01", "2026-01-31", "0", "25",  "10", "Draft"],
  ["4", "Structural Steel - Erection",    "120000", "",   "1", "2026-01-01", "2026-01-31", "0", "0",   "10", "Draft"],
];

/**
 * Header aliases → canonical field. Lets a real-world CSV/XLSX header
 * ("Scheduled Value", "Line #", "% Complete", "Cost Code") map onto the
 * fields the importer understands. Keys are matched after `normalizeHeader`.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  line_item_number: ["line item number", "line", "line #", "line no", "item", "item #", "item number", "no", "#"],
  description: ["desc", "scope", "item description", "work description"],
  scheduled_value: ["scheduled value", "value", "amount", "contract value", "scheduled amount", "sov value"],
  application_number: ["application number", "app", "app #", "application", "pay app", "pay app #"],
  period_from: ["period from", "from", "start", "period start"],
  period_to: ["period to", "to", "end", "period end"],
  previous_percent_complete: ["previous % complete", "previous percent", "prev %", "previous %", "% prev"],
  current_percent_complete: ["current % complete", "current percent", "% complete", "percent complete", "% comp", "current %"],
  retainage_percent: ["retainage %", "retainage", "retention", "retention %"],
  status: ["state"],
  cost_code: ["cost code", "code", "cost code number", "cost code #", "cc"],
  cost_code_name: ["cost code name", "code name"],
};

// Reverse lookup: normalized header string → canonical field.
const ALIAS_LOOKUP = (() => {
  const out: Record<string, string> = {};
  for (const canonical of Object.keys(HEADER_ALIASES)) {
    out[canonical] = canonical; // canonical name maps to itself
    out[canonical.replace(/_/g, " ")] = canonical;
    for (const alias of HEADER_ALIASES[canonical]) out[normalizeHeader(alias)] = canonical;
  }
  return out;
})();

/** Lowercase, trim, collapse whitespace, strip a trailing/leading BOM. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map a raw header to its canonical field, or the normalized header if unknown. */
export function canonicalizeHeader(h: unknown): string {
  const norm = normalizeHeader(h);
  return ALIAS_LOOKUP[norm] || norm;
}

/**
 * RFC-4180 CSV → array-of-arrays. Handles quoted fields, escaped quotes ("")
 * inside quotes, and CRLF/LF line endings. Strips a leading UTF-8 BOM so an
 * Excel-exported CSV doesn't corrupt the first header.
 */
export function parseCsvToAoa(text: unknown): string[][] {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch === "\r") {
      // CRLF: the \n branch finalises the row.
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Array-of-arrays (header row + data rows) → canonical row objects. The first
 * non-empty row is the header. Blank data rows are dropped. Used by both the
 * CSV path (via parseCsvToAoa) and the XLSX path (via sheet_to_json header:1).
 */
export function aoaToRows(aoa: unknown): SovRow[] {
  const grid = (Array.isArray(aoa) ? aoa : []).filter(
    (r): r is unknown[] => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")
  );
  if (grid.length === 0) return [];
  const headers = grid[0].map(canonicalizeHeader);
  return grid.slice(1).map((r) => {
    const obj: SovRow = {};
    headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? "").trim(); });
    return obj;
  });
}

/**
 * Ordered keyword rules → standard steel cost-code description. First match
 * wins, so more specific rules (Deck Install, Field Labor) precede generic
 * ones (Deck, Misc). The standard names mirror the 14 default steel cost codes
 * seeded into every project (migration 086).
 */
const COST_CODE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bdetail/i, "Detailing"],
  [/anchor|embed/i, "Anchor Bolts/Embeds"],
  [/joist/i, "Joist"],
  [/deck\s*(install|erect)|install\s*deck/i, "Deck Install"],
  [/\bdeck\b/i, "Deck"],
  [/galv|paint|\bcoat|primer|\bprime\b|blast/i, "Special Coatings"],
  [/fabricat|shop\s*labor|\bshop\b/i, "Shop Labor and Fabrication"],
  [/raw\s*material|\bmill\b|\bmaterial\b/i, "Raw Material"],
  [/erect|structural\s*(erection|install|field)|field\s*labor\s*-?\s*struct/i, "Field Labor - Structural"],
  [/field\s*labor\s*-?\s*misc|misc\.?\s*labor/i, "Field Labor - Misc."],
  [/crane|equipment|\blift\b|man\s*lift|\bboom\b/i, "Equipment"],
  [/\bship|freight|deliver|\bhaul|\btruck|transport/i, "Shipping"],
  [/mobiliz|\bp\.?m\.?\b|\badmin|management|overhead|general\s*conditions/i, "PM/Admin"],
  [/\bmisc/i, "Misc."],
];

/**
 * Suggest a steel cost code for a line description, resolved against the
 * project's actual cost codes. Returns `{ cost_code, cost_code_name }` (number +
 * name, matching CostCodeSelect's code/name pair) or `null` when no keyword
 * rule fires or the project has no code with the matched standard name — never
 * forces a fallback, so unmapped rows surface for human review.
 */
export function suggestCostCode(
  description: unknown,
  costCodes: ReadonlyArray<SovCostCode> | null | undefined = [],
): SovCostCodeSuggestion | null {
  const text = String(description || "");
  if (!text.trim() || !Array.isArray(costCodes) || costCodes.length === 0) return null;
  for (const [pattern, standardName] of COST_CODE_RULES) {
    if (!pattern.test(text)) continue;
    const target = standardName.toLowerCase();
    const match =
      costCodes.find((c) => String(c.description || "").trim().toLowerCase() === target) ||
      costCodes.find((c) => String(c.description || "").trim().toLowerCase().includes(target));
    return match ? { cost_code: match.cost_code_number, cost_code_name: match.description } : null;
  }
  return null;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Tolerant numeric parse for spreadsheet cells: strips $ signs, thousands
 * commas, surrounding whitespace, and a trailing % ("$25,000.50", "50%").
 * Returns the fallback when nothing parseable remains.
 */
const numLoose = (v: unknown, fallback = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const cleaned = String(v ?? "").trim().replace(/^\$/, "").replace(/,/g, "").replace(/%$/, "");
  if (cleaned === "") return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Canonical SOV statuses (must match the SOVFormModal enum). Every billed
 * rollup exact-matches "Certified"/"Paid", so an off-case status imported
 * verbatim would silently vanish from billed-to-date, cash collected, and
 * revenue reports. Normalize case-insensitively; unknown values fall back
 * to Draft so nothing is counted as billed without review.
 */
const SOV_STATUSES: readonly SovStatus[] = ["Draft", "Submitted", "Certified", "Paid"];

export function normalizeSovStatus(raw: unknown): { status: SovStatus; recognized: boolean } {
  const cleaned = String(raw ?? "").trim().toLowerCase();
  if (!cleaned) return { status: "Draft", recognized: true };
  const match = SOV_STATUSES.find((s) => s.toLowerCase() === cleaned);
  return match ? { status: match, recognized: true } : { status: "Draft", recognized: false };
}

/**
 * Map canonical rows to stage-able SOV records for the pre-import review.
 * Each entry: `{ record, valid, reason, autoMapped }`. `record` holds only DB
 * fields; the review modal commits `staged.filter(s => s.valid).map(s => s.record)`.
 *
 * Cost code: an explicit `cost_code` column wins (its name resolved from the
 * project codes); otherwise it's auto-suggested from the description.
 */
export function buildSovStaged(
  rows: ReadonlyArray<SovRow> | null | undefined,
  { project, existingCount = 0, costCodes = [] }: BuildSovStagedOptions = {},
): SovStagedRow[] {
  const baseApp = num(rows?.[0]?.application_number, 1) || 1;
  return (rows || []).map((row, idx) => {
    const description = (row.description || "").trim();
    const scheduledValue = numLoose(row.scheduled_value, 0);
    const lineNum = num(row.line_item_number, 0) || existingCount + idx + 1;
    const { status, recognized: statusRecognized } = normalizeSovStatus(row.status);

    // Percent cells: fail closed on garbage instead of silently importing 0%
    // (a zeroed percent passes review as "Ready" and understates billed-to-date).
    const prevPctRaw = row.previous_percent_complete;
    const currPctRaw = row.current_percent_complete;
    const prevPct = numLoose(prevPctRaw, NaN);
    const currPct = numLoose(currPctRaw, NaN);
    const badPercent =
      (String(prevPctRaw ?? "").trim() !== "" && !Number.isFinite(prevPct)) ||
      (String(currPctRaw ?? "").trim() !== "" && !Number.isFinite(currPct));

    // Cost code: explicit column first, else auto-map from description.
    let cost_code: string | null = (row.cost_code || "").trim() || null;
    let cost_code_name: string | null = (row.cost_code_name || "").trim() || null;
    let autoMapped = false;
    if (cost_code && !cost_code_name) {
      const found = costCodes.find((c) => String(c.cost_code_number) === cost_code);
      if (found) cost_code_name = found.description;
    }
    if (!cost_code) {
      const suggestion = suggestCostCode(description, costCodes);
      if (suggestion) {
        cost_code = suggestion.cost_code;
        cost_code_name = suggestion.cost_code_name;
        autoMapped = true;
      }
    }

    const record: SovRecord = {
      sov_id: `SOV-${String(existingCount + idx + 1).padStart(3, "0")}`,
      project_id: project?.id,
      project_name: project?.name || "",
      line_item_number: lineNum,
      description,
      scheduled_value: scheduledValue,
      cost_code,
      cost_code_name,
      application_number: num(row.application_number, baseApp) || baseApp,
      period_from: row.period_from || null,
      period_to: row.period_to || null,
      previous_percent_complete: Number.isFinite(prevPct) ? prevPct : 0,
      current_percent_complete: Number.isFinite(currPct) ? currPct : 0,
      retainage_percent:
        row.retainage_percent === "" || row.retainage_percent == null ? 10 : numLoose(row.retainage_percent, 10),
      status,
    };

    const valid = Boolean(description) && scheduledValue > 0 && !badPercent && statusRecognized;
    const reason = !description
      ? "Missing description"
      : !(scheduledValue > 0)
        ? "Scheduled value must be > 0"
        : badPercent
          ? "Percent complete is not a number"
          : !statusRecognized
            ? `Unknown status "${String(row.status).trim()}" (use Draft/Submitted/Certified/Paid)`
            : null;

    return { record, valid, reason, autoMapped };
  });
}
