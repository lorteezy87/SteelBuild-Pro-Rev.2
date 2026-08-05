/**
 * importRfiCsv.js
 *
 * Plain-CSV importer for RFI logs. No AI, no credits, no external
 * service — parses the file client-side and returns the same
 * `{ header, rfis }` shape that importRfiLog.extractRfiLog returns so
 * the existing commit path (importRfiLog.commitRfiLog) can be reused
 * verbatim.
 *
 * Supports the common GC / steel-shop export formats (Procore,
 * PlanGrid, Bluebeam, generic Excel → Save As CSV). Column headers are
 * matched case-insensitively and tolerate minor variation — "RFI #",
 * "Number", "No.", "Subject", "Title", etc. — so the user doesn't have
 * to massage the file first. If a header can't be identified, that row
 * is skipped rather than crashing the whole parse.
 */

// ── CSV parser ──────────────────────────────────────────────────────
//
// Small handwritten parser that handles the 4 real-world gotchas:
//   1. CRLF / LF / mixed line endings
//   2. Quoted fields ("can contain, commas")
//   3. Escaped quotes ("contains ""quoted"" text")
//   4. UTF-8 BOM at the very start of the file (Excel always writes it)
//
// Returns an array of row arrays. Pulling in papaparse for 30 lines of
// parsing would be overkill.
function firstNonEmptyLine(value) {
  return String(value || "").split(/\r?\n/).find((line) => line.trim()) || "";
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}

function chooseDelimiter(src) {
  const line = firstNonEmptyLine(src);
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(line, delimiter) }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsv(raw) {
  if (typeof raw !== "string") return [];
  // Strip UTF-8 BOM if present.
  let src = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const delimiter = chooseDelimiter(src);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") {
      // Handle \r, \r\n
      row.push(field); field = "";
      rows.push(row); row = [];
      if (src[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
      i++; continue;
    }
    field += c; i++;
  }
  // Trailing field / row — but only push a row if there's something in
  // it. Otherwise a CSV that ends with a newline would add a phantom
  // empty row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v && v.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ── Column aliases ──────────────────────────────────────────────────
//
// For each logical field we care about, list every label we've seen in
// real exports. Match is case-insensitive, trimmed, and ignores
// punctuation — so "RFI #", "rfi_number", and "RFI Number" all resolve
// to the same slot.
const COLUMN_ALIASES = {
  rfi_number: ["rfi #", "rfi number", "rfi no", "number", "no", "no.", "#", "rfi id", "id", "rfi"],
  title:      ["subject", "title", "description", "question", "summary"],
  assigned_to: [
    "assigned to", "to", "ball in court", "assignee", "recipient",
    "responsible", "reviewer", "from", "issued to",
  ],
  date_submitted: [
    "date submitted", "submitted", "submitted date", "date", "date issued",
    "issued date", "issue date", "submit date", "submitted on", "date sent",
  ],
  date_required: [
    "date required", "required date", "required", "due date", "due",
    "date due", "response due", "due by", "answer by", "req date", "need by",
  ],
  date_answered: [
    "date answered", "answered date", "answered", "date responded",
    "response date", "responded", "ans date", "closed date", "date closed",
    "date resolved", "response", "answer date",
  ],
  status: ["status", "state", "rfi status"],
};

// Job number can appear as a row in the file's header area *or* as a
// column (one job number per row). We look for the column version; the
// header-area version is best handled by the user picking a project in
// the preview step.
const JOB_NUMBER_ALIASES = ["job number", "job #", "job no", "project number", "project #", "project no", "job", "project"];

const normalize = (s) => String(s ?? "").toLowerCase().trim().replace(/[._-]+/g, " ").replace(/\s+/g, " ");

function buildColumnIndex(headerRow) {
  const idx = { job_number: -1 };
  for (const key of Object.keys(COLUMN_ALIASES)) idx[key] = -1;

  const normalized = headerRow.map((h) => normalize(h));
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;
    if (idx.job_number === -1 && JOB_NUMBER_ALIASES.includes(cell)) {
      idx.job_number = i;
      continue;
    }
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (idx[key] !== -1) continue;
      if (aliases.includes(cell)) { idx[key] = i; break; }
    }
  }
  return idx;
}

// ── Date normalization ──────────────────────────────────────────────
//
// Accepts MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, "Jan 5, 2026", "5-Jan-26",
// and Excel's m/d/yy quirks. Returns YYYY-MM-DD or null.
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
function normalizeCsvDate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO YYYY-MM-DD
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // MM/DD/YYYY or M/D/YYYY or MM/DD/YY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) { const yn = parseInt(y, 10); y = String(yn >= 70 ? 1900 + yn : 2000 + yn); }
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Month-name formats: "Jan 5, 2026", "Jan 5 2026", "5 Jan 2026", "5-Jan-26"
  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      let y = m[3];
      if (y.length === 2) { const yn = parseInt(y, 10); y = String(yn >= 70 ? 1900 + yn : 2000 + yn); }
      return `${y}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) {
      let y = m[3];
      if (y.length === 2) { const yn = parseInt(y, 10); y = String(yn >= 70 ? 1900 + yn : 2000 + yn); }
      return `${y}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }

  // Last resort: let Date.parse try. Only accept if it yields a year in
  // the sane range — otherwise we'd happily normalize garbage like "3"
  // into 2001 (JS Date weirdness).
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (y >= 1980 && y <= 2200) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Parse an RFI-log CSV string and return the same `{ header, rfis }`
 * shape the AI importer returns, so the commit step (commitRfiLog) can
 * reuse its logic unchanged.
 *
 * - `header.job_number` is set if the CSV has a job-number column AND
 *   every row agrees. Otherwise the user picks the project in the
 *   preview step (the modal already handles that path).
 * - Rows missing an RFI number are skipped (counts reported via
 *   `skippedBlankRows`).
 * - The parser returns a `warnings` array so the UI can tell the user
 *   "we couldn't identify a 'Subject' column" etc.
 */
export function parseRfiCsv(csvText, { fileName = "" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { header: {}, rfis: [], warnings: ["File is empty."], skippedBlankRows: 0 };
  }

  // Find the header row. Most CSV exports put it at the top, but Procore
  // and a couple of other tools prepend a metadata preamble. Heuristic:
  // scan the first ~10 rows and pick the one that yields the most column
  // matches when treated as a header.
  let bestIdx = 0;
  let bestIdxObj = null;
  let bestScore = -1;
  const SCAN_LIMIT = Math.min(10, rows.length);
  for (let r = 0; r < SCAN_LIMIT; r++) {
    const candidate = buildColumnIndex(rows[r]);
    const score = Object.values(candidate).filter((v) => v >= 0).length;
    if (score > bestScore) { bestScore = score; bestIdx = r; bestIdxObj = candidate; }
  }

  const warnings = [];
  if (bestScore < 2) {
    warnings.push(
      `Couldn't confidently identify RFI columns from the header row. ` +
      `We looked at the first ${SCAN_LIMIT} rows. Make sure the file has a row labeled "RFI #", "Subject", etc.`
    );
  }
  const idx = bestIdxObj || buildColumnIndex(rows[0]);
  if (idx.rfi_number < 0) warnings.push(`No RFI-number column found (looked for "RFI #", "Number", etc.).`);
  if (idx.title       < 0) warnings.push(`No subject/title column found.`);

  // Header-level metadata we can infer. Project name isn't usually in
  // the CSV; filename is the best fallback the user will see.
  const header = { job_name: fileName ? fileName.replace(/\.csv$/i, "") : undefined };

  const rfis = [];
  const jobNumbers = new Set();
  let skippedBlankRows = 0;

  for (let r = bestIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((v) => !v || !String(v).trim())) continue;

    const pick = (key) => (idx[key] >= 0 ? String(row[idx[key]] ?? "").trim() : "");

    const rawNum = pick("rfi_number");
    const num = rawNum.replace(/^RFI\s*#?\s*/i, "").replace(/^#/, "").trim();
    if (!num) { skippedBlankRows++; continue; }

    const title = pick("title");
    const assigned = pick("assigned_to");
    const dSub = pick("date_submitted");
    const dReq = pick("date_required");
    const dAns = pick("date_answered");
    const job  = pick("job_number");

    if (job) jobNumbers.add(job.replace(/\D+/g, ""));

    rfis.push({
      rfi_number:     num,
      title:          title || "(no subject)",
      assigned_to:    assigned || null,
      date_submitted: dSub || null,
      iso_submitted:  normalizeCsvDate(dSub),
      date_required:  dReq || null,
      iso_required:   normalizeCsvDate(dReq),
      date_answered:  dAns || null,
      iso_answered:   normalizeCsvDate(dAns),
    });
  }

  // If every row agreed on a single job number, lift it into the header
  // so the outer project-matching logic can still auto-resolve.
  if (jobNumbers.size === 1) {
    const [onlyJob] = jobNumbers;
    if (onlyJob) header.job_number = onlyJob;
  }

  return { header, rfis, warnings, skippedBlankRows };
}

/**
 * Load a user-supplied File and return parseRfiCsv's result. Size-guard
 * mirrors importRfiLog — CSVs won't actually be 32 MB, but a consistent
 * ceiling is friendlier than surprising the user.
 */
export async function readRfiCsvFile(file) {
  if (!file) throw new Error("No file provided.");
  const looksCsv =
    /\.(csv|tsv|txt)$/i.test(file.name) ||
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "text/plain";
  if (!looksCsv) throw new Error("File must be a CSV (or plain text).");
  if (file.size > 8 * 1024 * 1024) throw new Error("CSV exceeds 8 MB.");
  const text = await file.text();
  return parseRfiCsv(text, { fileName: file.name });
}
