/**
 * importChangeOrderCsv.js
 *
 * Plain-CSV bulk import for change orders. Mirrors the RFI-log
 * importer (src/lib/importRfiCsv.js) — no AI, no credits, no
 * network; parses client-side and returns a `{ header, cos }` shape
 * the modal's commit step can feed into
 * entities.ChangeOrder.create().
 *
 * Supports the common GC / owner export formats (Procore, Sage,
 * Vista, Newforma, plain Excel "Save As CSV"). Column headers are
 * matched case-insensitively with generous synonym lists so users
 * don't have to massage the file before uploading.
 *
 * Columns the change_orders table actually uses (per the schema):
 *   co_number      text   — identifier (e.g. "CO-001", "CCO #14")
 *   title          text   — short name
 *   description    text   — longer scope text
 *   reason_code    text   — owner/GC categorization
 *   status         text   — Draft / Submitted / Under Review /
 *                           Approved / Rejected / Void
 *   co_amount      numeric — $ amount
 *   submitted_date date    — YYYY-MM-DD
 *   approved_date  date    — YYYY-MM-DD
 *   approved_by    text
 *   notes          text
 *   schedule_impact_days integer
 *   margin_percent numeric
 *   project_name   text   — free-text project label (for display)
 *   project_id     uuid   — REQUIRED; populated by the commit step
 *                          from the selected project, not the CSV
 *
 * The parser doesn't try to resolve project_id itself — that's the
 * commit step's job (same pattern as importRfiCsv). A CSV can carry
 * a "Project Number" column for informational display / auto-match,
 * but the authoritative project_id comes from whatever the user
 * picks in the preview.
 */

// ── Shared CSV tokenizer ────────────────────────────────────────────
export function parseCsv(raw) {
  if (typeof raw !== "string") return [];
  // UTF-8 BOM stripper — Excel writes one on every CSV save.
  let src = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
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
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") {
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v && v.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ── Column aliases ──────────────────────────────────────────────────
//
// Every tool spells these columns a little differently. We match
// normalized (lowercase, punctuation-collapsed) header text against
// broad alias sets. First column that maps wins; unmatched columns
// are ignored.
const COLUMN_ALIASES = {
  co_number: [
    "co #", "co no", "co number", "number", "no", "no.", "#",
    "change order #", "change order no", "change order number",
    "cco #", "cco number", "co id", "id", "co",
  ],
  title: [
    "title", "subject", "description short", "co title",
    "change order title", "summary", "name",
  ],
  description: [
    "description", "scope", "scope description", "details", "notes",
    "change description", "long description",
  ],
  reason_code: [
    "reason", "reason code", "type", "category", "change type",
    "classification", "co type",
  ],
  status: [
    "status", "state", "co status", "approval status", "phase",
  ],
  co_amount: [
    "amount", "co amount", "change order amount", "cost",
    "price", "value", "total", "sub total", "change value",
  ],
  submitted_date: [
    "submitted", "submitted date", "date submitted", "issue date",
    "issued", "issued date", "date issued", "date", "submit date",
    "co date",
  ],
  approved_date: [
    "approved", "approved date", "date approved", "approval date",
    "date approval", "executed", "executed date",
  ],
  approved_by: [
    "approved by", "approver", "signed by", "executed by",
    "approval by",
  ],
  notes: [
    "note", "notes", "comment", "comments", "remarks",
  ],
  schedule_impact_days: [
    "schedule impact", "schedule days", "days impact",
    "schedule impact days", "time impact", "days", "time ext",
    "time extension",
  ],
  margin_percent: [
    "margin", "margin %", "margin percent", "margin pct",
    "gross margin", "gm%", "gm %",
  ],
  project_name: [
    "project", "project name", "job", "job name",
  ],
  project_number: [
    "project number", "project #", "project no", "project no.",
    "job number", "job #", "job no", "job no.",
  ],
};

const normalize = (s) => String(s ?? "")
  .toLowerCase()
  .trim()
  .replace(/[._\-#]+/g, " ")
  .replace(/\s+/g, " ");

function buildColumnIndex(headerRow) {
  const idx = {};
  for (const key of Object.keys(COLUMN_ALIASES)) idx[key] = -1;
  const normalized = headerRow.map((h) => normalize(h));
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (idx[key] !== -1) continue;
      if (aliases.includes(cell)) { idx[key] = i; break; }
    }
  }
  return idx;
}

// ── Field normalization ─────────────────────────────────────────────
//
// Dates: accept MM/DD/YYYY, M/D/YY, ISO YYYY-MM-DD, "Jan 5, 2026",
// "5-Jan-26". Sane-year gate [1980, 2200] guards Date.parse's weird
// two-digit-year fallback.
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
function normalizeDate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) { const yn = parseInt(y, 10); y = String(yn >= 70 ? 1900 + yn : 2000 + yn); }
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

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

  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (y >= 1980 && y <= 2200) return d.toISOString().slice(0, 10);
  }
  return null;
}

// "$12,345.67" → 12345.67. Strips $ sign, commas, whitespace,
// and trailing text like "USD". Returns null when unparsable so
// the DB sees a real number or nothing at all (no NaN coercion).
function normalizeMoney(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[$,\s]/g, "").replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normalizeInt(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[,\s]/g, "");
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function normalizePercent(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/%/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normalizeStatus(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // Map common variants → the canonical status values the DB + UI use.
  if (/^draft$/.test(s)) return "Draft";
  if (/^(submitted|sent|issued)$/.test(s)) return "Submitted";
  if (/^(under\s*review|in\s*review|reviewing|pending)$/.test(s)) return "Under Review";
  if (/^(approved|executed|accepted)$/.test(s)) return "Approved";
  // "closed" is ambiguous — a CO can be closed-out as approved, rejected, OR
  // withdrawn — so it must NOT be silently elevated to Approved (that inflated
  // approved-contract-value rollups). Map it to a neutral Closed the reviewer
  // can reclassify in the import preview.
  if (/^(closed|closed\s*out|complete|completed)$/.test(s)) return "Closed";
  if (/^(rejected|denied|declined)$/.test(s)) return "Rejected";
  if (/^(void|cancelled|canceled|withdrawn)$/.test(s)) return "Void";
  // Pass through whatever the user wrote if none matched — the DB
  // has no CHECK constraint on status, so arbitrary values are fine.
  return String(raw).trim();
}

// ── Parser ──────────────────────────────────────────────────────────
/**
 * Parse a change-order-log CSV and return
 *   { header: { job_number? }, cos: [...], warnings: [...], skippedBlankRows: n }
 *
 * - Auto-detects the header row by scanning the first ~10 rows for
 *   the best column-alias match (so Procore-style preambles don't
 *   break the parse).
 * - Skips rows without a co_number.
 * - Returns warnings when critical columns are missing (no number,
 *   no title/description) so the UI can surface "we couldn't find a
 *   title column — every CO will be imported with empty title".
 */
export function parseChangeOrderCsv(csvText, { fileName = "" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { header: {}, cos: [], warnings: ["File is empty."], skippedBlankRows: 0 };
  }

  // Header-row auto-detection: scan first 10 rows and pick the one
  // with the most recognized columns.
  let bestIdx = 0;
  let bestScore = -1;
  let bestIdxObj = null;
  const SCAN_LIMIT = Math.min(10, rows.length);
  for (let r = 0; r < SCAN_LIMIT; r++) {
    const candidate = buildColumnIndex(rows[r]);
    const score = Object.values(candidate).filter((v) => v >= 0).length;
    if (score > bestScore) { bestScore = score; bestIdx = r; bestIdxObj = candidate; }
  }

  const warnings = [];
  if (bestScore < 2) {
    warnings.push(
      `Couldn't confidently identify change-order columns from the header. ` +
      `Expected headers like "CO #", "Title", "Amount", "Status". Got: ${rows[bestIdx].join(", ")}`,
    );
  }
  const idx = bestIdxObj || buildColumnIndex(rows[0]);
  if (idx.co_number < 0)  warnings.push(`No CO-number column found (looked for "CO #", "Number", "CCO", etc.).`);
  if (idx.title < 0 && idx.description < 0) warnings.push(`No title or description column found — CO names will be blank.`);

  const header = {
    job_name: fileName ? fileName.replace(/\.csv$/i, "") : undefined,
  };

  const cos = [];
  const projectNumbers = new Set();
  let skippedBlankRows = 0;

  for (let r = bestIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((v) => !v || !String(v).trim())) continue;

    const pick = (key) => (idx[key] >= 0 ? String(row[idx[key]] ?? "").trim() : "");

    const rawNum = pick("co_number");
    const num = rawNum.replace(/^CO\s*#?\s*/i, "").replace(/^CCO\s*#?\s*/i, "").replace(/^#/, "").trim();
    if (!num) { skippedBlankRows++; continue; }

    const title    = pick("title");
    const desc     = pick("description");
    const reason   = pick("reason_code");
    const status   = pick("status");
    const amount   = pick("co_amount");
    const subDate  = pick("submitted_date");
    const appDate  = pick("approved_date");
    const appBy    = pick("approved_by");
    const notes    = pick("notes");
    const schedDays = pick("schedule_impact_days");
    const margin   = pick("margin_percent");
    const projName = pick("project_name");
    const projNum  = pick("project_number");

    if (projNum) projectNumbers.add(projNum.replace(/\D+/g, ""));

    cos.push({
      co_number: num,
      title:        title || (desc ? desc.slice(0, 120) : ""),
      description:  desc || null,
      reason_code:  reason || null,
      status:       normalizeStatus(status) || "Draft",
      co_amount:    normalizeMoney(amount),
      submitted_date: normalizeDate(subDate),
      approved_date:  normalizeDate(appDate),
      approved_by:  appBy || null,
      notes:        notes || null,
      schedule_impact_days: normalizeInt(schedDays),
      margin_percent: normalizePercent(margin),
      project_name: projName || null,
      _project_number_hint: projNum || null,
      _raw: {
        amount_raw: amount, submitted_raw: subDate, approved_raw: appDate,
      },
    });
  }

  // Single-project detection: if every row agreed on a project number,
  // expose it so the UI can auto-select the matching project.
  if (projectNumbers.size === 1) {
    const [only] = projectNumbers;
    if (only) header.job_number = only;
  }

  return { header, cos, warnings, skippedBlankRows };
}

/**
 * Read a user-selected File and return the parsed result. Size cap
 * matches importRfiCsv — 8 MB is wildly generous for a CO log.
 */
export async function readChangeOrderCsvFile(file) {
  if (!file) throw new Error("No file provided.");
  const looksCsv =
    /\.(csv|tsv|txt)$/i.test(file.name) ||
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "text/plain";
  if (!looksCsv) throw new Error("File must be a CSV (or plain text).");
  if (file.size > 8 * 1024 * 1024) throw new Error("CSV exceeds 8 MB.");
  const text = await file.text();
  return parseChangeOrderCsv(text, { fileName: file.name });
}
