/**
 * Pure CSV/TSV parse + duplicate flags for WPBulkAddModal.
 */

export const VALID_PHASES = ["Detailing", "Fabrication", "Delivery", "Erection"];
export const VALID_STATUSES = ["Not Started", "In Progress", "Complete", "On Hold"];

export const HEADER_ALIASES = {
  "wp #": "wp_number",
  "wp#": "wp_number",
  "wp number": "wp_number",
  "wp_number": "wp_number",
  "number": "wp_number",
  "#": "wp_number",
  "name": "name",
  "description": "name",
  "phase": "phase",
  "status": "status",
  "tonnage": "tonnage",
  "tons": "tonnage",
  "% complete": "percent_complete",
  "percent complete": "percent_complete",
  "percent_complete": "percent_complete",
  "progress": "percent_complete",
  "crew": "crew",
  "shop hrs budget": "shop_hours_budget",
  "shop_hrs_budget": "shop_hours_budget",
  "shop hours budget": "shop_hours_budget",
  "shop hrs actual": "shop_hours_actual",
  "shop_hrs_actual": "shop_hours_actual",
  "shop hours actual": "shop_hours_actual",
  "notes": "notes",
};

// Strip an optional wrapping "" quote pair, and collapse escaped "".
const unquote = (s) => {
  if (s == null) return "";
  let v = String(s).trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1).replace(/""/g, '"');
  }
  return v;
};

// Parse a single line honoring "..." quoted fields.
const splitLine = (line, delim) => {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const detectDelim = (raw) => {
  const first = (raw.split(/\r?\n/).find((l) => l.trim()) || "");
  const tabs = (first.match(/\t/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return tabs >= commas ? "\t" : ",";
};

const parsePct = (s) => {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/%/g, "").trim());
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : NaN;
};

const parseNum = (s) => {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
};

// Title-case-ish matcher for phase/status so "fabrication" → "Fabrication".
const matchEnum = (raw, choices) => {
  if (!raw) return null;
  const needle = String(raw).trim().toLowerCase();
  return choices.find((c) => c.toLowerCase() === needle) || null;
};

/**
 * parseBlock — takes raw textarea content and returns an array of row objects
 * with normalized fields and per-row validation errors.
 */
export function parseBlock(raw: string) {
  if (!raw || !raw.trim()) return { rows: [], headerDetected: false, columnMap: null };

  const delim = detectDelim(raw);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headerDetected: false, columnMap: null };

  // Header detection: if the first row's cells all match known aliases, treat as header.
  const firstCells = splitLine(lines[0], delim).map(unquote);
  const firstLower = firstCells.map((c) => c.toLowerCase().replace(/[_\s]+/g, " ").trim());
  const matchedAliases = firstLower.filter((c) => HEADER_ALIASES[c]);
  const headerDetected = matchedAliases.length >= Math.max(2, Math.floor(firstLower.length * 0.6));

  let columnMap; // index → field name
  let dataLines;
  if (headerDetected) {
    columnMap = firstLower.map((c) => HEADER_ALIASES[c] || null);
    dataLines = lines.slice(1);
  } else {
    // No header → assume exportCSV column order.
    columnMap = [
      "wp_number", "name", "phase", "status", "tonnage",
      "percent_complete", "crew", "shop_hours_budget", "shop_hours_actual", "notes",
    ];
    dataLines = lines;
  }

  const rows = dataLines.map((line, idx) => {
    const cells = splitLine(line, delim).map(unquote);
    const fields = {};
    columnMap.forEach((key, i) => {
      if (key && cells[i] !== undefined) fields[key] = cells[i];
    });

    // Normalize
    const wp_number = (fields.wp_number || "").trim();
    const name = (fields.name || "").trim();
    const phaseRaw = (fields.phase || "").trim();
    const statusRaw = (fields.status || "").trim();
    const tonnage = parseNum(fields.tonnage);
    const percent_complete = parsePct(fields.percent_complete);
    const crew = (fields.crew || "").trim();
    const shop_hours_budget = parseNum(fields.shop_hours_budget);
    const shop_hours_actual = parseNum(fields.shop_hours_actual);
    const notes = (fields.notes || "").trim();

    const phase = matchEnum(phaseRaw, VALID_PHASES);
    const status = matchEnum(statusRaw, VALID_STATUSES) || "Not Started";

    const errors = {};
    if (!name) errors.name = "Required";
    if (phaseRaw && !phase) errors.phase = `Invalid (${phaseRaw})`;
    if (statusRaw && !matchEnum(statusRaw, VALID_STATUSES))
      errors.status = `Invalid (${statusRaw})`;
    if (Number.isNaN(tonnage)) errors.tonnage = "NaN";
    if (Number.isNaN(percent_complete)) errors.percent_complete = "NaN";
    if (Number.isNaN(shop_hours_budget)) errors.shop_hours_budget = "NaN";
    if (Number.isNaN(shop_hours_actual)) errors.shop_hours_actual = "NaN";

    return {
      __index: idx,
      wp_number,
      name,
      phase: phase || "Detailing",
      status,
      tonnage: Number.isNaN(tonnage) ? 0 : tonnage,
      percent_complete: Number.isNaN(percent_complete) ? 0 : percent_complete,
      crew,
      shop_hours_budget: Number.isNaN(shop_hours_budget) ? 0 : shop_hours_budget,
      shop_hours_actual: Number.isNaN(shop_hours_actual) ? 0 : shop_hours_actual,
      notes,
      errors,
    };
  });

  return { rows, headerDetected, columnMap };
}


export function buildExistingWpNumberSet(
  existingWPs: Array<{ wp_number?: string | null }> | null | undefined,
): Set<string> {
  return new Set(
    (existingWPs || []).map((w) => (w.wp_number || "").trim()).filter(Boolean),
  );
}

export function flagDuplicateWpRows<T extends { wp_number?: string }>(
  rows: T[],
  existingWpNumbers: Set<string>,
): Array<T & { isDuplicate: string | boolean }> {
  return rows.map((r) => ({
    ...r,
    isDuplicate: (r.wp_number && existingWpNumbers.has(r.wp_number)) as string | boolean,
  }));
}

export const PREVIEW_COLUMNS: Array<{
  key: string;
  label: string;
  width: number;
  numeric?: boolean;
}> = [
  { key: "wp_number", label: "WP #", width: 96 },
  { key: "name", label: "Name", width: 260 },
  { key: "phase", label: "Phase", width: 124 },
  { key: "status", label: "Status", width: 128 },
  { key: "tonnage", label: "Tons", width: 82, numeric: true },
  { key: "percent_complete", label: "%", width: 72, numeric: true },
  { key: "crew", label: "Crew", width: 126 },
  { key: "shop_hours_budget", label: "Shop Bud", width: 104, numeric: true },
  { key: "shop_hours_actual", label: "Shop Act", width: 104, numeric: true },
  { key: "notes", label: "Notes", width: 200 },
];

export const PREVIEW_MIN_WIDTH =
  PREVIEW_COLUMNS.reduce((sum, col) => sum + col.width, 46);

/** Paste textarea chrome (extends shared Phoenix inputStyle at use site). */
export const PASTE_INPUT_EXTRA: Record<string, string | number> = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  lineHeight: "20px",
  minHeight: 160,
  maxHeight: 240,
  whiteSpace: "pre",
  overflow: "auto",
  resize: "vertical",
  tabSize: 4,
};

export const WP_BULK_EXAMPLE = `WP #	Name	Phase	Status	Tonnage	% Complete	Crew	Shop Hrs Budget	Shop Hrs Actual	Notes
WP-001	Shop A - Main Steel	Fabrication	Not Started	42.5	0%		120	0	
WP-002	Shop B - Misc Steel	Detailing	Not Started	18.2	0%		80	0	`;

/** Compose paste-area style from PhoenixModal inputStyle + extras. */
export function buildPasteInputStyle(
  inputStyle: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...inputStyle, ...extra };
}
