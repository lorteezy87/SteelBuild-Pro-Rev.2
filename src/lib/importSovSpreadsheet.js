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
const HEADER_ALIASES = {
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
  const out = {};
  for (const canonical of Object.keys(HEADER_ALIASES)) {
    out[canonical] = canonical; // canonical name maps to itself
    out[canonical.replace(/_/g, " ")] = canonical;
    for (const alias of HEADER_ALIASES[canonical]) out[normalizeHeader(alias)] = canonical;
  }
  return out;
})();

/** Lowercase, trim, collapse whitespace, strip a trailing/leading BOM. */
export function normalizeHeader(h) {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map a raw header to its canonical field, or the normalized header if unknown. */
export function canonicalizeHeader(h) {
  const norm = normalizeHeader(h);
  return ALIAS_LOOKUP[norm] || norm;
}

/**
 * RFC-4180 CSV → array-of-arrays. Handles quoted fields, escaped quotes ("")
 * inside quotes, and CRLF/LF line endings. Strips a leading UTF-8 BOM so an
 * Excel-exported CSV doesn't corrupt the first header.
 */
export function parseCsvToAoa(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let field = "";
  let row = [];
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
export function aoaToRows(aoa) {
  const grid = (Array.isArray(aoa) ? aoa : []).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")
  );
  if (grid.length === 0) return [];
  const headers = grid[0].map(canonicalizeHeader);
  return grid.slice(1).map((r) => {
    const obj = {};
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
const COST_CODE_RULES = [
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
 *
 * @param {string} description
 * @param {Array<{cost_code_number: string, description: string}>} costCodes
 */
export function suggestCostCode(description, costCodes = []) {
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

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Map canonical rows to stage-able SOV records for the pre-import review.
 * Each entry: `{ record, valid, reason, autoMapped }`. `record` holds only DB
 * fields; the review modal commits `staged.filter(s => s.valid).map(s => s.record)`.
 *
 * Cost code: an explicit `cost_code` column wins (its name resolved from the
 * project codes); otherwise it's auto-suggested from the description.
 */
export function buildSovStaged(rows, { project, existingCount = 0, costCodes = [] } = {}) {
  const baseApp = num(rows?.[0]?.application_number, 1) || 1;
  return (rows || []).map((row, idx) => {
    const description = (row.description || "").trim();
    const scheduledValue = num(row.scheduled_value, 0);
    const lineNum = num(row.line_item_number, 0) || existingCount + idx + 1;

    // Cost code: explicit column first, else auto-map from description.
    let cost_code = (row.cost_code || "").trim() || null;
    let cost_code_name = (row.cost_code_name || "").trim() || null;
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

    const record = {
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
      previous_percent_complete: num(row.previous_percent_complete, 0),
      current_percent_complete: num(row.current_percent_complete, 0),
      retainage_percent:
        row.retainage_percent === "" || row.retainage_percent == null ? 10 : num(row.retainage_percent, 10),
      status: row.status || "Draft",
    };

    const valid = Boolean(description) && scheduledValue > 0;
    const reason = !description
      ? "Missing description"
      : !(scheduledValue > 0)
        ? "Scheduled value must be > 0"
        : null;

    return { record, valid, reason, autoMapped };
  });
}
