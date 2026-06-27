/**
 * markupExport.js
 *
 * Utilities for packaging selected drawings/markups into a consolidated
 * export for issue review. Builds on the existing markupPDF.js helpers
 * but adds:
 *   - Multi-drawing selection and consolidation
 *   - Issue summary report by sheet
 *   - Bluebeam-compatible export structure
 *
 * This module is a pure utility layer; the UI trigger lives in
 * components/integrations/PdfImportQueue.jsx and the existing
 * ExportMarkupPDFModal.jsx.
 */

import { jsPDF } from "jspdf";
import {
  computeMarkupStats,
  computeSetMarkupStats,
  getCommentsFromMarkup,
  filterComments,
  formatDateShort,
  statusLabel,
  statusColor,
} from "@/lib/exports/markupPDF";

// ── Color palette (matches markupPDF.js) ────────────���───────────────────────
const C = {
  black:   [15, 17, 24],
  accent:  [200, 155, 32],
  muted:   [100, 110, 130],
  border:  [210, 215, 225],
  rowEven: [245, 247, 250],
  rowOdd:  [255, 255, 255],
  white:   [255, 255, 255],
  error:   [220, 38, 38],
  warning: [202, 138, 4],
  success: [22, 163, 74],
};

// ── Export package builder ───────────────────────────────────────────────────

/**
 * Generate a consolidated markup export PDF covering multiple drawings.
 * Includes an issue summary table listing all open items by sheet, followed
 * by per-sheet detail sections.
 *
 * @param {object} opts
 * @param {object} opts.project          { id, name, project_number }
 * @param {Array}  opts.drawings         Array of drawing objects with `markup` JSONB
 * @param {object} [opts.options]
 * @param {boolean} [opts.options.openOnly]       Only include open issues
 * @param {boolean} [opts.options.includeSummary]  Include the summary table (default true)
 * @param {string}  [opts.options.title]           Custom title
 * @param {Date}    [opts.options.now]             Override for tests
 * @returns {jsPDF} The generated PDF instance (caller calls .save())
 */
export function generateMarkupExportPackage({
  project = {},
  drawings = [],
  options = {},
} = {}) {
  const {
    openOnly = false,
    includeSummary = true,
    title = "Markup Export Package",
    now = new Date(),
  } = options;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Cover page ─────────────────────────────────────────────────────────────
  pdf.setFillColor(...C.black);
  pdf.rect(0, 0, PAGE_W, 110, "F");

  pdf.setTextColor(...C.accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("STEELBUILD PRO · MARKUP EXPORT", MARGIN, 36);

  pdf.setTextColor(...C.white);
  pdf.setFontSize(20);
  pdf.text(String(title), MARGIN, 64);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(220, 220, 220);
  pdf.text(project.name || "", MARGIN, 84);

  pdf.setFontSize(8);
  pdf.text(`Generated ${formatDateShort(now)}`, PAGE_W - MARGIN, 36, { align: "right" });
  if (project.project_number) {
    pdf.text(`Job: ${project.project_number}`, PAGE_W - MARGIN, 50, { align: "right" });
  }
  pdf.text(
    `${drawings.length} sheet${drawings.length === 1 ? "" : "s"} · ${openOnly ? "Open issues only" : "All markups"}`,
    PAGE_W - MARGIN, 64, { align: "right" }
  );

  // Aggregate stats
  const agg = computeSetMarkupStats(drawings);
  let y = 140;

  pdf.setDrawColor(...C.border);
  pdf.setFillColor(...C.rowEven);
  pdf.rect(MARGIN, y, CONTENT_W, 70, "FD");

  const statBoxes = [
    ["SHEETS", String(agg.sheetCount)],
    ["MARKUPS", String(agg.totalMarkups)],
    ["OPEN", String(agg.openComments)],
    ["ADDRESSED", String(agg.addressedComments)],
    ["REJECTED", String(agg.rejectedComments)],
  ];
  const colW = CONTENT_W / statBoxes.length;
  statBoxes.forEach(([label, value], i) => {
    const x = MARGIN + i * colW;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(label, x + 12, y + 30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...C.black);
    pdf.text(value, x + 12, y + 52);
  });
  y += 90;

  // ── Issue summary table ───────────────────────���────────────────────────────
  if (includeSummary && drawings.length > 0) {
    const ensureSpace = (need) => {
      if (y + need > PAGE_H - MARGIN) { pdf.addPage(); y = MARGIN; }
    };

    ensureSpace(40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...C.black);
    pdf.text("ISSUE SUMMARY BY SHEET", MARGIN, y);
    y += 18;

    // Table header
    const cols = [140, 80, 60, 60, 60, CONTENT_W - 400];
    const headers = ["SHEET", "TOTAL", "OPEN", "ADDRESSED", "REJECTED", "DISCIPLINE"];
    pdf.setFillColor(...C.black);
    pdf.rect(MARGIN, y, CONTENT_W, 18, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.white);
    let cx = MARGIN + 6;
    headers.forEach((h, i) => {
      pdf.text(h, cx, y + 12);
      cx += cols[i];
    });
    y += 18;

    // Rows
    pdf.setFont("helvetica", "normal");
    drawings.forEach((drawing, idx) => {
      ensureSpace(18);
      const stats = computeMarkupStats(drawing.markup);
      const bg = idx % 2 === 0 ? C.rowOdd : C.rowEven;
      pdf.setFillColor(...bg);
      pdf.rect(MARGIN, y, CONTENT_W, 16, "F");

      let x = MARGIN + 6;
      pdf.setFontSize(8);
      pdf.setTextColor(...C.black);
      pdf.text(
        `${drawing.sheet_number || "—"}  ${(drawing.title || "").slice(0, 24)}`,
        x, y + 11
      );
      x += cols[0];

      pdf.text(String(stats.comments), x, y + 11);
      x += cols[1];

      pdf.setTextColor(...C.warning);
      pdf.text(String(stats.openComments), x, y + 11);
      x += cols[2];

      pdf.setTextColor(...C.success);
      pdf.text(String(stats.addressedComments), x, y + 11);
      x += cols[3];

      pdf.setTextColor(...C.error);
      pdf.text(String(stats.rejectedComments), x, y + 11);
      x += cols[4];

      pdf.setTextColor(...C.muted);
      pdf.text(drawing.discipline || "—", x, y + 11);

      y += 16;
    });

    y += 16;
  }

  // ── Per-sheet detail sections ─────────���────────────────────────────────────
  for (const drawing of drawings) {
    const ensureSpace = (need) => {
      if (y + need > PAGE_H - MARGIN) { pdf.addPage(); y = MARGIN; }
    };

    const comments = filterComments(getCommentsFromMarkup(drawing.markup), { openOnly });
    if (comments.length === 0 && openOnly) continue;

    ensureSpace(50);

    // Sheet header bar
    pdf.setFillColor(...C.black);
    pdf.rect(MARGIN, y, CONTENT_W, 22, "F");
    pdf.setTextColor(...C.white);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(
      `${drawing.sheet_number || "—"}  ${drawing.title || ""}`.trim(),
      MARGIN + 8, y + 15
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.accent);
    const meta = [
      drawing.revision_number ? `R${drawing.revision_number}` : null,
      drawing.stage || null,
      drawing.discipline || null,
    ].filter(Boolean).join(" · ");
    pdf.text(meta, PAGE_W - MARGIN - 8, y + 15, { align: "right" });
    y += 28;

    if (comments.length === 0) {
      pdf.setTextColor(...C.muted);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      pdf.text("No comments on this sheet.", MARGIN, y + 10);
      pdf.setFont("helvetica", "normal");
      y += 24;
      continue;
    }

    // Comment table header
    const colWidths = [60, 80, 70, CONTENT_W - 210];
    const tHeaders = ["STATUS", "AUTHOR", "DATE", "COMMENT"];
    pdf.setFillColor(...C.border);
    pdf.rect(MARGIN, y, CONTENT_W, 14, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...C.black);
    cx = MARGIN + 6;
    tHeaders.forEach((h, i) => {
      pdf.text(h, cx, y + 10);
      cx += colWidths[i];
    });
    y += 14;

    // Comment rows
    pdf.setFont("helvetica", "normal");
    for (const [idx, c] of comments.entries()) {
      const bodyLines = pdf.splitTextToSize(String(c.text || ""), colWidths[3] - 12);
      const rowH = Math.max(16, bodyLines.length * 10 + 6);
      ensureSpace(rowH + 2);

      const bg = idx % 2 === 0 ? C.rowOdd : C.rowEven;
      pdf.setFillColor(...bg);
      pdf.rect(MARGIN, y, CONTENT_W, rowH, "F");

      let x = MARGIN + 6;
      pdf.setTextColor(...statusColor(c.status));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.text(statusLabel(c.status), x, y + 10);
      x += colWidths[0];

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...C.black);
      pdf.text(String(c.created_by || "—").slice(0, 18), x, y + 10);
      x += colWidths[1];

      pdf.setTextColor(...C.muted);
      pdf.text(formatDateShort(c.created_at), x, y + 10);
      x += colWidths[2];

      pdf.setTextColor(...C.black);
      pdf.text(bodyLines, x, y + 10);

      y += rowH;
    }

    y += 12;
  }

  // ── Page footers ──────────────────────────────────────────────────────────
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

/**
 * Suggest a filename for the exported markup package.
 *
 * @param {object} opts
 * @param {string} [opts.projectNumber]
 * @param {string} [opts.label]   set name or custom label
 * @param {Date}   [opts.now]
 * @returns {string}
 */
export function suggestExportFilename({ projectNumber, label, now = new Date() } = {}) {
  const parts = [];
  if (projectNumber) parts.push(String(projectNumber).replace(/\s+/g, "_"));
  if (label) parts.push(String(label).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_|_$/g, ""));
  parts.push("markup_export");
  parts.push(now.toISOString().slice(0, 10));
  return `${parts.join("_")}.pdf`;
}

/**
 * Build an issue summary data structure (useful for non-PDF displays).
 *
 * @param {Array} drawings
 * @param {object} [opts]
 * @param {boolean} [opts.openOnly]
 * @returns {{ sheets: Array<{sheet_number, title, stats}>, totals }}
 */
export function buildIssueSummary(drawings = [], { openOnly = false } = {}) {
  const sheets = drawings.map((d) => {
    const stats = computeMarkupStats(d.markup);
    const comments = filterComments(getCommentsFromMarkup(d.markup), { openOnly });
    return {
      id: d.id,
      sheet_number: d.sheet_number || "—",
      title: d.title || "",
      discipline: d.discipline || null,
      revision_number: d.revision_number || null,
      stats,
      commentCount: comments.length,
    };
  });

  const totals = computeSetMarkupStats(drawings);

  return { sheets, totals };
}
