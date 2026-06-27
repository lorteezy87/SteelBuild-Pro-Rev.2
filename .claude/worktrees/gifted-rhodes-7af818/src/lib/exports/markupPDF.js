/**
 * markupPDF.js — Markup summary PDF export helpers.
 *
 * Two flavors:
 *  - Drawing-level: cover page + per-sheet thumbnails + per-comment table.
 *  - Set-level: same shape, aggregated across every sheet in the set.
 *
 * Pure helpers live here; the React modal in
 * components/drawings/ExportMarkupPDFModal.jsx wires user options to
 * `generateMarkupSummaryPdf()` and triggers a browser download.
 *
 * Markup data model (per useMarkup.js): each drawing has a
 * `markup` JSONB column whose value is an array of items shaped like
 *   { id, kind, pdf_page, color, geom, text?, status?, created_at, created_by? }
 * `kind` is one of "pen" | "rect" | "arrow" | "note". Only "note"
 * items have `text` and a resolution status. Sign-offs live in the
 * separate drawing_signoffs table; the modal resolves those server-side
 * before calling these pure helpers.
 */

import { jsPDF } from "jspdf";

// ── Color palette (RGB) — match generateTransmittal.js for visual parity ──
const C = {
  black:   [15, 17, 24],
  accent:  [200, 155, 32],
  muted:   [100, 110, 130],
  border:  [210, 215, 225],
  rowEven: [245, 247, 250],
  rowOdd:  [255, 255, 255],
  white:   [255, 255, 255],
};

const STATUS_COLOR = {
  open:      [202, 138, 4],
  addressed: [22, 163, 74],
  rejected:  [220, 38, 38],
};

// ── Pure helpers (exported for tests) ────────────────────────────────────

/**
 * A "comment" for the PDF report is any markup item that has a text body
 * — i.e. items of kind "note". Pen / rect / arrow are pure annotations
 * with no body, so they don't make sense on a comment table. They are
 * still counted in the per-sheet stats line.
 */
export function isCommentMarkup(item) {
  return !!item && item.kind === "note" && typeof item.text === "string" && item.text.trim() !== "";
}

/**
 * Pull just the comment-shaped items out of a drawing's markup array.
 * Defensive: handles null / non-array input from older rows.
 */
export function getCommentsFromMarkup(markup) {
  if (!Array.isArray(markup)) return [];
  return markup.filter(isCommentMarkup);
}

/**
 * Status filter. "open" means anything not explicitly closed
 * (addressed / rejected). Treat missing status as open.
 */
export function isOpenComment(item) {
  if (!isCommentMarkup(item)) return false;
  const s = (item.status || "open").toLowerCase();
  return s !== "addressed" && s !== "rejected";
}

/**
 * Filter a list of comments down to the user's selection.
 *
 * @param {Array} comments      already filtered to comment-shaped items
 * @param {object} opts
 * @param {boolean} opts.openOnly  true → keep only open comments
 * @returns {Array}
 */
export function filterComments(comments, opts = {}) {
  const { openOnly = false } = opts;
  if (!openOnly) return comments;
  return comments.filter(isOpenComment);
}

/**
 * Per-sheet stats line for the cover summary.
 * { totalMarkups, comments, openComments, addressedComments, rejectedComments }
 */
export function computeMarkupStats(markup) {
  const safe = Array.isArray(markup) ? markup : [];
  const comments = safe.filter(isCommentMarkup);
  let open = 0, addressed = 0, rejected = 0;
  for (const c of comments) {
    const s = (c.status || "open").toLowerCase();
    if (s === "addressed") addressed += 1;
    else if (s === "rejected") rejected += 1;
    else open += 1;
  }
  return {
    totalMarkups: safe.length,
    comments: comments.length,
    openComments: open,
    addressedComments: addressed,
    rejectedComments: rejected,
  };
}

/**
 * Aggregate stats across an array of sheets (each with `markup`).
 */
export function computeSetMarkupStats(sheets) {
  const agg = { sheetCount: 0, totalMarkups: 0, comments: 0, openComments: 0, addressedComments: 0, rejectedComments: 0 };
  if (!Array.isArray(sheets)) return agg;
  for (const s of sheets) {
    agg.sheetCount += 1;
    const stats = computeMarkupStats(s?.markup);
    agg.totalMarkups += stats.totalMarkups;
    agg.comments += stats.comments;
    agg.openComments += stats.openComments;
    agg.addressedComments += stats.addressedComments;
    agg.rejectedComments += stats.rejectedComments;
  }
  return agg;
}

/**
 * Format a Date / ISO string as a short readable date for the PDF.
 * Returns "—" for falsy / unparseable input so the table cells stay
 * lined up.
 */
export function formatDateShort(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Friendly status label. Falls back to "OPEN" for missing values.
 */
export function statusLabel(status) {
  const s = (status || "open").toLowerCase();
  if (s === "addressed") return "ADDRESSED";
  if (s === "rejected") return "REJECTED";
  return "OPEN";
}

export function statusColor(status) {
  const s = (status || "open").toLowerCase();
  return STATUS_COLOR[s] || STATUS_COLOR.open;
}

/**
 * Suggest a download filename for a markup PDF.
 *
 * @param {object} opts
 * @param {string} [opts.scope] "drawing" | "set"
 * @param {string} [opts.label] sheet number or set name
 * @param {Date}   [opts.now]   override for tests
 */
export function suggestMarkupPdfFilename({ scope = "drawing", label = "", now = new Date() } = {}) {
  const safe = String(label).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "drawing";
  const stamp = now.toISOString().slice(0, 10);
  const tag = scope === "set" ? "set_markups" : "markups";
  return `${safe}_${tag}_${stamp}.pdf`;
}

// ── PDF rendering (impure — uses jsPDF) ─────────────────────────────────

/**
 * Generate the markup summary PDF as a jsPDF instance. The caller is
 * responsible for `.save(filename)` (or `.output(...)` for tests).
 *
 * @param {object} opts
 * @param {object} opts.project        { id, name }
 * @param {string} [opts.scope]        "drawing" | "set"
 * @param {string} [opts.title]        cover page main title
 * @param {string} [opts.subtitle]     cover page subtitle (set name etc.)
 * @param {Array}  opts.sheets         list of drawings { sheet_number, title, revision_number, stage, markup, thumbnail_url? }
 * @param {boolean} [opts.openOnly]    keep only open comments in the table
 * @param {Array}  [opts.signoffs]     optional list { drawing_id, sheet_number, signed_by, signed_at, status }
 * @param {Date}   [opts.now]
 */
export function generateMarkupSummaryPdf({
  project = {},
  scope = "drawing",
  title = "Markup Summary",
  subtitle = "",
  sheets = [],
  openOnly = false,
  signoffs = [],
  now = new Date(),
} = {}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Cover page ─────────────────────────────────────────────────────────
  pdf.setFillColor(...C.black);
  pdf.rect(0, 0, PAGE_W, 110, "F");

  pdf.setTextColor(...C.accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("STEELBUILD PRO · MARKUP SUMMARY", MARGIN, 36);

  pdf.setTextColor(...C.white);
  pdf.setFontSize(20);
  pdf.text(String(title || "Markup Summary"), MARGIN, 64);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(220, 220, 220);
  pdf.text(String(subtitle || project.name || ""), MARGIN, 84);

  pdf.setFontSize(8);
  pdf.text(`Generated ${formatDateShort(now)}`, PAGE_W - MARGIN, 36, { align: "right" });
  if (project.name) pdf.text(`Project: ${project.name}`, PAGE_W - MARGIN, 50, { align: "right" });
  if (scope === "set") pdf.text(`Scope: Set (${sheets.length} sheet${sheets.length === 1 ? "" : "s"})`, PAGE_W - MARGIN, 64, { align: "right" });
  else pdf.text(`Scope: Drawing`, PAGE_W - MARGIN, 64, { align: "right" });

  // Aggregate stats card
  const agg = computeSetMarkupStats(sheets);
  let y = 150;
  pdf.setDrawColor(...C.border);
  pdf.setFillColor(...C.rowEven);
  pdf.rect(MARGIN, y, CONTENT_W, 80, "FD");
  pdf.setFontSize(9);
  pdf.setTextColor(...C.muted);
  pdf.text("SUMMARY", MARGIN + 12, y + 18);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...C.black);
  const statBoxes = [
    ["SHEETS", String(agg.sheetCount)],
    ["MARKUPS", String(agg.totalMarkups)],
    ["COMMENTS", String(agg.comments)],
    ["OPEN", String(agg.openComments)],
    ["ADDRESSED", String(agg.addressedComments)],
    ["REJECTED", String(agg.rejectedComments)],
  ];
  const colW = CONTENT_W / statBoxes.length;
  statBoxes.forEach(([label, value], i) => {
    const x = MARGIN + i * colW;
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.setFont("helvetica", "normal");
    pdf.text(label, x + 12, y + 42);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...C.black);
    pdf.text(value, x + 12, y + 62);
  });

  y += 100;

  // ── Per-sheet sections ─────────────────────────────────────────────────
  const ensureSpace = (need) => {
    if (y + need > PAGE_H - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  for (const sheet of sheets) {
    ensureSpace(60);
    // Sheet header
    pdf.setFillColor(...C.black);
    pdf.rect(MARGIN, y, CONTENT_W, 24, "F");
    pdf.setTextColor(...C.white);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    const sheetLabel = `${sheet.sheet_number || "—"}  ${sheet.title || ""}`.trim();
    pdf.text(sheetLabel, MARGIN + 8, y + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.accent);
    const meta = [
      sheet.revision_number ? `R${sheet.revision_number}` : null,
      sheet.stage || null,
    ].filter(Boolean).join(" · ");
    pdf.text(meta, PAGE_W - MARGIN - 8, y + 16, { align: "right" });
    y += 30;

    // Stats line
    const stats = computeMarkupStats(sheet.markup);
    pdf.setTextColor(...C.muted);
    pdf.setFontSize(8);
    pdf.text(
      `Markups: ${stats.totalMarkups}  |  Comments: ${stats.comments}  |  Open: ${stats.openComments}  |  Addressed: ${stats.addressedComments}  |  Rejected: ${stats.rejectedComments}`,
      MARGIN,
      y
    );
    y += 14;

    // Comments table
    const comments = filterComments(getCommentsFromMarkup(sheet.markup), { openOnly });
    if (comments.length === 0) {
      pdf.setTextColor(...C.muted);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      pdf.text(openOnly ? "No open comments." : "No comments on this sheet.", MARGIN, y + 12);
      pdf.setFont("helvetica", "normal");
      y += 30;
    } else {
      // Header row
      const colWidths = [60, 90, 70, CONTENT_W - 60 - 90 - 70];
      const headers = ["STATUS", "AUTHOR", "DATE", "BODY"];
      pdf.setFillColor(...C.border);
      pdf.rect(MARGIN, y, CONTENT_W, 16, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...C.black);
      let cx = MARGIN + 6;
      headers.forEach((h, i) => {
        pdf.text(h, cx, y + 11);
        cx += colWidths[i];
      });
      y += 16;

      pdf.setFont("helvetica", "normal");
      comments.forEach((c, idx) => {
        const bodyLines = pdf.splitTextToSize(String(c.text || ""), colWidths[3] - 12);
        const rowH = Math.max(18, bodyLines.length * 11 + 6);
        ensureSpace(rowH + 2);
        const fillColor = idx % 2 === 0 ? C.rowOdd : C.rowEven;
        pdf.setFillColor(...fillColor);
        pdf.rect(MARGIN, y, CONTENT_W, rowH, "F");

        let x = MARGIN + 6;
        // STATUS
        pdf.setTextColor(...statusColor(c.status));
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.text(statusLabel(c.status), x, y + 12);
        x += colWidths[0];

        // AUTHOR
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...C.black);
        pdf.text(String(c.created_by || "—"), x, y + 12);
        x += colWidths[1];

        // DATE
        pdf.setTextColor(...C.muted);
        pdf.text(formatDateShort(c.created_at), x, y + 12);
        x += colWidths[2];

        // BODY (multi-line)
        pdf.setTextColor(...C.black);
        pdf.text(bodyLines, x, y + 12);

        y += rowH;
      });
    }

    // Sign-offs for this sheet, if any were passed in
    const signs = (signoffs || []).filter((s) => s.drawing_id === sheet.id || s.sheet_number === sheet.sheet_number);
    if (signs.length > 0) {
      ensureSpace(24 + signs.length * 14);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...C.muted);
      pdf.text("SIGN-OFFS", MARGIN, y + 12);
      y += 16;
      pdf.setFont("helvetica", "normal");
      signs.forEach((s) => {
        pdf.setTextColor(...C.black);
        pdf.text(`${s.signed_by || "—"} · ${formatDateShort(s.signed_at)} · ${s.status || "—"}`, MARGIN + 8, y + 10);
        y += 12;
      });
    }

    y += 10;
  }

  // Footer on every page
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 24, { align: "right" });
    pdf.text("STEELBUILD PRO", MARGIN, PAGE_H - 24);
  }

  return pdf;
}
