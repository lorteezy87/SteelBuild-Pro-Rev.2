import React, { useMemo, useState } from "react";

/**
 * SubmittalBulkAddModal — bulk-create submittals from one of two flows:
 *
 *   1. CSV PASTE  - user pastes a tab- or comma-separated block from
 *      Excel / Google Sheets. The first row is treated as the header
 *      (or auto-detected if the first row looks like data). Header
 *      synonyms are mapped to canonical column names. A row needs at
 *      least `submittal_number` OR `title` to be considered valid.
 *
 *   2. SEQUENTIAL - user enters a starting number ("S-001"), a count,
 *      and an optional title prefix. The modal generates N draft rows
 *      with the trailing numeric segment incremented per row, padded
 *      to the same width as the seed (so "S-001" → "S-002", not "S-2").
 *      Useful for spec-section-driven imports where you know you'll
 *      have, say, 14 connection submittals before any titles exist.
 *
 * On commit the parent batches Submittal.create over the parsed rows.
 * Defaults (status="Draft", ball_in_court="Contractor") are applied
 * here if the row didn't supply them — kept in sync with the page-
 * level defaults so the round-trip CSV out → CSV in is stable.
 *
 * Built fresh rather than forking RfiLogImportModal: that modal is
 * tightly coupled to PDF upload + AI extraction + project-matching,
 * none of which apply here.
 */

const STATUSES = [
  "Draft", "Submitted", "Under Review", "Approved", "Approved as Noted",
  "Revise and Resubmit", "Rejected", "Released for Fabrication", "Void",
];
// Standardized across the submittal modals — see src/pages/Submittals.jsx
// for the canonical list and stage-mapping rationale.
const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

// DB CHECK constraint allows only these values for submittal_type (or NULL).
// Anything else from a pasted CSV produces a 400 from PostgREST, so we clamp
// to canonical values here. Match is case/punctuation-insensitive.
const SUBMITTAL_TYPES = ["Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other"];

function clampToEnum(value, choices) {
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
const HEADER_SYNONYMS = {
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

const CANONICAL_FIELDS = [
  "submittal_number", "title", "discipline", "submittal_type",
  "status", "ball_in_court", "required_date", "submitted_date",
  "spec_section", "submitted_by", "notes",
];

function normalizeHeader(h) {
  return (h || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Splits a row by tab or comma — Excel paste defaults to tabs but
// CSV exports use commas. We accept either; if the line has tabs we
// prefer tabs (safer with commas inside titles).
function splitRow(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  // Naive comma split — does not handle quoted fields with commas.
  // For the bulk-add flow (which is paste-from-spreadsheet) this is
  // good enough; the "right" way is exporting as TSV from Excel.
  return line.split(",").map((c) => c.trim());
}

// Normalize an ISO-ish date or US "M/D/YY" date to YYYY-MM-DD. If we
// can't parse it, return "" so the row falls through to a null write.
function normalizeDate(s) {
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

function parseCsv(text) {
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
function buildSequence(seed, count) {
  const m = (seed || "").match(/^(.*?)(\d+)$/);
  if (!m) return Array.from({ length: count }, (_, i) => `${seed || "SUB-"}${i + 1}`);
  const [, prefix, num] = m;
  const start = Number(num);
  const width = num.length;
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${String(start + i).padStart(width, "0")}`,
  );
}

export default function SubmittalBulkAddModal({ open, onCancel, onSubmit, busy = false }) {
  const [mode, setMode] = useState("csv");
  // CSV mode
  const [csvText, setCsvText] = useState("");
  // Sequential mode
  const [seqStart, setSeqStart] = useState("S-001");
  const [seqCount, setSeqCount] = useState(10);
  const [seqTitlePrefix, setSeqTitlePrefix] = useState("");

  const parsed = useMemo(() => {
    if (mode === "csv") {
      const p = parseCsv(csvText);
      return { rows: p.rows, errors: p.errors };
    }
    const count = Math.max(1, Math.min(500, Number(seqCount) || 0));
    const numbers = buildSequence(seqStart, count);
    const rows = numbers.map((n, i) => ({
      submittal_number: n,
      title: seqTitlePrefix ? `${seqTitlePrefix} ${i + 1}` : "",
      status: "Draft",
      ball_in_court: "Contractor",
    }));
    return { rows, errors: [] };
  }, [mode, csvText, seqStart, seqCount, seqTitlePrefix]);

  const reset = () => {
    if (busy) return;
    setCsvText(""); setSeqStart("S-001"); setSeqCount(10); setSeqTitlePrefix("");
    onCancel();
  };

  const commit = () => {
    if (busy) return;
    if (parsed.rows.length === 0) return;
    // Apply defaults + DB-safety clamps at commit time so the parent
    // doesn't need to know about them. The submittals table requires
    // BOTH submittal_number AND title (NOT NULL), and the
    // submittal_type / status CHECK constraints reject any value not
    // in the canonical enum. Without these clamps a pasted CSV with
    // only a number column, or with lower-cased "shop drawing", would
    // 400 every row from PostgREST.
    const enriched = parsed.rows.map((r) => {
      const clampedType = clampToEnum(r.submittal_type, SUBMITTAL_TYPES);
      const clampedStatus = clampToEnum(r.status, STATUSES) || "Draft";
      // Backfill missing NOT NULLs from whichever column the user
      // gave us — better than a row-failed toast for "no title".
      const submittal_number = (r.submittal_number || r.title || "").trim();
      const title = (r.title || r.submittal_number || "").trim();
      const out = {
        ball_in_court: "Contractor",
        ...r,
        submittal_number,
        title,
        status: clampedStatus,
      };
      // submittal_type: clamp to enum or omit entirely (column is
      // nullable; sending an empty string would hit the CHECK).
      if (clampedType) out.submittal_type = clampedType;
      else delete out.submittal_type;
      return out;
    });
    onSubmit(enriched);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bulk add submittals"
      style={{
        position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={reset}
    >
      <div
        className="sbd-card-strong"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720, maxWidth: "94vw", maxHeight: "92vh", overflow: "hidden",
          display: "flex", flexDirection: "column",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)", borderRadius: 4,
          boxShadow: "var(--shadow-lg)", color: "var(--text-primary)",
          padding: 0,
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase" }}>
            Bulk Add
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
            Create many submittals at once
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {[
              { id: "csv", label: "CSV PASTE" },
              { id: "seq", label: "SEQUENTIAL" },
            ].map((t) => {
              const active = mode === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setMode(t.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 3,
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                    background: active ? "var(--accent-muted)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {mode === "csv" && (
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                Paste from Excel or a CSV. First row should be column headers.
                Recognized columns: <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>submittal_number, title, discipline, submittal_type, status, ball_in_court, required_date, submitted_date, spec_section, submitted_by, notes</code>.
                A row needs <strong>submittal_number</strong> or <strong>title</strong> at minimum.
              </div>
              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"submittal_number\ttitle\tdiscipline\tsubmittal_type\nS-001\tStructural shop drawings - Area A\tStructural\tShop Drawing\nS-002\tAnchor bolt setting plan\tStructural\tShop Drawing"}
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 11,
                  fontFamily: "var(--font-mono)", resize: "vertical",
                  background: "var(--bg-input, var(--bg-surface-low))",
                  border: "1px solid var(--border-default)", borderRadius: 3,
                  color: "var(--text-primary)", whiteSpace: "pre",
                }}
              />
            </div>
          )}

          {mode === "seq" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  Starting number
                </div>
                <input
                  value={seqStart}
                  onChange={(e) => setSeqStart(e.target.value)}
                  placeholder="S-001"
                  style={{
                    width: "100%", padding: "6px 10px", fontSize: 12, fontFamily: "var(--font-mono)",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)", borderRadius: 3,
                    color: "var(--text-primary)",
                  }}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  Trailing digits keep their pad width. "S-001" → "S-002", "S-1" → "S-2".
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  Count
                </div>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={seqCount}
                  onChange={(e) => setSeqCount(e.target.value)}
                  style={{
                    width: "100%", padding: "6px 10px", fontSize: 12, fontFamily: "var(--font-mono)",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)", borderRadius: 3,
                    color: "var(--text-primary)",
                  }}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  Capped at 500 per batch.
                </div>
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  Title prefix (optional)
                </div>
                <input
                  value={seqTitlePrefix}
                  onChange={(e) => setSeqTitlePrefix(e.target.value)}
                  placeholder="e.g. Connection submittal"
                  style={{
                    width: "100%", padding: "6px 10px", fontSize: 12,
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)", borderRadius: 3,
                    color: "var(--text-primary)", fontFamily: "var(--font-body)",
                  }}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  Each row gets "{seqTitlePrefix || "<prefix>"} 1", "{seqTitlePrefix || "<prefix>"} 2", etc. Leave blank to create titleless drafts.
                </div>
              </div>
              <div style={{ gridColumn: "1 / span 2", fontSize: 10, color: "var(--text-muted)" }}>
                Status defaults to <strong>Draft</strong>; ball-in-court defaults to <strong>Contractor</strong>. Edit any row after creation from the list.
              </div>
            </div>
          )}

          {/* Preview */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Preview ({parsed.rows.length})
              </div>
              {parsed.errors.length > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)" }}>
                  {parsed.errors.length} parse warning{parsed.errors.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
            {parsed.rows.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, border: "1px dashed var(--border-default)", borderRadius: 3 }}>
                No rows yet. {mode === "csv" ? "Paste a header row + data rows above." : "Set a count above."}
              </div>
            ) : (
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 3, maxHeight: 220, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-low)" }}>
                    <tr>
                      {["#", "Title", "Discipline", "Type", "Status", "BIC", "Required"].map((h) => (
                        <th key={h} style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                          color: "var(--text-muted)", padding: "6px 8px", textAlign: "left",
                          borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 6).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--divider)" }}>
                        <Td mono accent>{r.submittal_number || "—"}</Td>
                        <Td>{r.title || "—"}</Td>
                        <Td>{r.discipline || "—"}</Td>
                        <Td>{r.submittal_type || "—"}</Td>
                        <Td mono>{r.status || "Draft"}</Td>
                        <Td mono>{r.ball_in_court || "Contractor"}</Td>
                        <Td mono>{r.required_date || "—"}</Td>
                      </tr>
                    ))}
                    {parsed.rows.length > 6 && (
                      <tr>
                        <td colSpan={7} style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                          + {parsed.rows.length - 6} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {parsed.errors.length > 0 && (
              <div style={{ marginTop: 8, padding: "6px 10px", border: "1px solid var(--status-warning)", borderRadius: 3, background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
                {parsed.errors.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)" }}>{e}</div>
                ))}
                {parsed.errors.length > 5 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    + {parsed.errors.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--bg-surface-low)" }}>
          <button
            onClick={reset}
            disabled={busy}
            style={{
              padding: "8px 14px", background: "transparent", border: "1px solid var(--border-default)",
              borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={commit}
            disabled={busy || parsed.rows.length === 0}
            style={{
              padding: "8px 14px",
              background: parsed.rows.length === 0 ? "var(--bg-surface)" : "var(--accent)",
              color: parsed.rows.length === 0 ? "var(--text-muted)" : "#fff",
              border: parsed.rows.length === 0 ? "1px solid var(--border-default)" : "none",
              borderRadius: 4, cursor: parsed.rows.length === 0 ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            {busy ? "ADDING..." : `CREATE ${parsed.rows.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Td({ children, mono, accent }) {
  return (
    <td style={{
      padding: "5px 8px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
      color: accent ? "var(--accent)" : "var(--text-primary)",
      whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
    }}>
      {children}
    </td>
  );
}

// Allow callers (and tests, if added later) to import the parser
// helpers in isolation. Useful for nudging the modal into a tested
// shape without dragging the full React tree.
export { parseCsv as __parseCsv, buildSequence as __buildSequence, normalizeDate as __normalizeDate };
