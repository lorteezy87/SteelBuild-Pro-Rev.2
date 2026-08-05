/**
 * Pure CSV/sequence parse + commit enrich for SubmittalBulkAddModal.
 */

export const STATUSES = [
  "Draft", "Submitted", "Under Review", "Approved", "Approved as Noted",
  "Revise and Resubmit", "Rejected", "Released for Fabrication", "Void",
];
// Standardized across the submittal modals — see src/pages/Submittals.jsx
// for the canonical list and stage-mapping rationale.
export const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

// DB CHECK constraint allows only these values for submittal_type (or NULL).
// Anything else from a pasted CSV produces a 400 from PostgREST, so we clamp
// to canonical values here. Match is case/punctuation-insensitive.
export const SUBMITTAL_TYPES = ["Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other"];

export function clampToEnum(value, choices) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  const norm = v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const c of choices) {
    if (c.toLowerCase().replace(/[^a-z0-9]+/g, "") === norm) return c;
  }
  return null;
}

// Header synonym → canonical column. Lower-cased + stripped of non-
// alphanumerics on lookup, so "Submittal #", "submittal_number",
// "SubmittalNumber" all collapse to the same key.
export const HEADER_SYNONYMS = {
  // submittal_number
  submittalnumber: "submittal_number",
  submittal: "submittal_number",
  number: "submittal_number",
  num: "submittal_number",
  no: "submittal_number",
  id: "submittal_number",
  // title
  title: "title",
  subject: "title",
  description: "title",
  desc: "title",
  // discipline
  discipline: "discipline",
  trade: "discipline",
  // submittal_type
  submittaltype: "submittal_type",
  type: "submittal_type",
  // status
  status: "status",
  // ball_in_court
  ballincourt: "ball_in_court",
  bic: "ball_in_court",
  ball: "ball_in_court",
  reviewer: "ball_in_court",
  // dates
  requireddate: "required_date",
  required: "required_date",
  duedate: "required_date",
  due: "required_date",
  needby: "required_date",
  submitteddate: "submitted_date",
  submitted: "submitted_date",
  sent: "submitted_date",
  // spec_section
  specsection: "spec_section",
  spec: "spec_section",
  section: "spec_section",
  // notes
  notes: "notes",
  comments: "notes",
  remarks: "notes",
  // submitted_by
  submittedby: "submitted_by",
  by: "submitted_by",
  detailer: "submitted_by",
  fabricator: "submitted_by",
};

export const CANONICAL_FIELDS = [
  "submittal_number", "title", "discipline", "submittal_type",
  "status", "ball_in_court", "required_date", "submitted_date",
  "spec_section", "submitted_by", "notes",
];

export function normalizeHeader(h) {
  return (h || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Splits a row by tab or comma — Excel paste defaults to tabs but
// CSV exports use commas. We accept either; if the line has tabs we
// prefer tabs (safer with commas inside titles).
export function splitRow(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  // Naive comma split — does not handle quoted fields with commas.
  // For the bulk-add flow (which is paste-from-spreadsheet) this is
  // good enough; the "right" way is exporting as TSV from Excel.
  return line.split(",").map((c) => c.trim());
}

// Normalize an ISO-ish date or US "M/D/YY" date to YYYY-MM-DD. If we
// can't parse it, return "" so the row falls through to a null write.
export function normalizeDate(s) {
  if (!s) return "";
  const trimmed = s.trim();
  if (!trimmed) return "";
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

export function parseCsv(text) {
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: [], headerMap: {} };

  const firstCells = splitRow(lines[0]);
  const looksLikeHeader = firstCells.some((c) => HEADER_SYNONYMS[normalizeHeader(c)]);
  let headers, dataLines;
  if (looksLikeHeader) {
    headers = firstCells.map((h) => HEADER_SYNONYMS[normalizeHeader(h)] || null);
    dataLines = lines.slice(1);
  } else {
    // No header row — assume the column order in the spec's "Required:
    // submittal_number OR title" doc: # then title then everything else
    // gets ignored. Better to ask the user to add a header row, but
    // this fallback keeps single-column paste-a-list usable.
    headers = firstCells.length === 1 ? ["submittal_number"] : ["submittal_number", "title"];
    dataLines = lines;
  }

  const headerMap = {};
  headers.forEach((h, i) => { if (h) headerMap[h] = i; });

  const rows = [];
  const errors = [];
  dataLines.forEach((line, idx) => {
    const cells = splitRow(line);
    const row = {};
    for (const field of CANONICAL_FIELDS) {
      const colIdx = headerMap[field];
      if (colIdx == null) continue;
      const raw = cells[colIdx];
      if (raw == null) continue;
      const value = raw.trim();
      if (!value) continue;
      if (field === "required_date" || field === "submitted_date") {
        const norm = normalizeDate(value);
        if (norm) row[field] = norm;
        else errors.push(`Row ${idx + 1}: couldn't parse date "${value}" — skipped`);
      } else {
        row[field] = value;
      }
    }
    if (!row.submittal_number && !row.title) {
      errors.push(`Row ${idx + 1}: missing submittal number AND title — skipped`);
      return;
    }
    rows.push(row);
  });

  return { rows, errors, headerMap };
}

// "S-001" + offset 0 → "S-001", + offset 1 → "S-002", padded to the
// trailing numeric width seen in the seed.
export function buildSequence(seed, count) {
  const m = (seed || "").match(/^(.*?)(\d+)$/);
  if (!m) return Array.from({ length: count }, (_, i) => `${seed || "SUB-"}${i + 1}`);
  const [, prefix, num] = m;
  const start = Number(num);
  const width = num.length;
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${String(start + i).padStart(width, "0")}`,
  );
}


export function buildBulkSubmittalPreview(args: {
  mode: string;
  csvText: string;
  seqStart: string;
  seqCount: number | string;
  seqTitlePrefix: string;
}) {
  const { mode, csvText, seqStart, seqCount, seqTitlePrefix } = args;
  if (mode === "csv") {
    const p = parseCsv(csvText);
    return { rows: p.rows, errors: p.errors };
  }
  const count = Math.max(1, Math.min(500, Number(seqCount) || 0));
  const numbers = buildSequence(seqStart, count);
  const rows = numbers.map((n: string, i: number) => ({
    submittal_number: n,
    title: seqTitlePrefix ? `${seqTitlePrefix} ${i + 1}` : "",
    status: "Draft",
    ball_in_court: "Contractor",
  }));
  return { rows, errors: [] as string[] };
}

export function enrichBulkSubmittalRows(rows: any[]) {
  return rows.map((r) => {
    const clampedType = clampToEnum(r.submittal_type, SUBMITTAL_TYPES);
    const clampedStatus = clampToEnum(r.status, STATUSES) || "Draft";
    const submittal_number = (r.submittal_number || r.title || "").trim();
    const title = (r.title || r.submittal_number || "").trim();
    const out: any = {
      ball_in_court: "Contractor",
      ...r,
      submittal_number,
      title,
      status: clampedStatus,
    };
    if (clampedType) out.submittal_type = clampedType;
    else delete out.submittal_type;
    return out;
  });
}
