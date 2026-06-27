/**
 * exportGanttPdf.js — Export the Schedule Gantt to a PDF file.
 *
 * Strategy: the on-screen gantt has two independently-scrolling panels
 * (left task list + right timeline). We can't just screenshot the
 * visible viewport — we need the whole thing. So:
 *
 *   1. Clone the gantt root off-screen.
 *   2. Kill internal scrolling on the clone: set overflow:visible and
 *      expand each scroll container to its scrollWidth/scrollHeight so
 *      the entire content is laid out in one big block.
 *   3. Strip UI chrome that doesn't belong in a distributed PDF
 *      (toolbar stats, drag handles, resize cursors).
 *   4. html2canvas the clone at 2× device pixels for crisp text.
 *   5. Tile the resulting image across tabloid-landscape PDF pages.
 *      The LEFT panel's pixel width is detected from the first header
 *      row so every page can repeat the task-list columns — readers
 *      always see task names alongside the timeline slice on their
 *      current page.
 *   6. Add a title-bar (project name, project #, today's date) and a
 *      footer (page x of y) to every page.
 *
 * Call site: Schedule.jsx wires this to an EXPORT PDF button. Returns a
 * Promise so the caller can disable the button while export runs.
 */

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ── Tuning constants ─────────────────────────────────────────────────
const CAPTURE_SCALE = 2;     // 2× for retina / print quality
const PAGE_FORMAT   = "tabloid"; // 11x17" — roughly the standard steel-schedule size
const PAGE_ORIENT   = "landscape";
const PAGE_MARGIN   = 24;    // pt
const HEADER_H      = 52;    // pt — title band at top of each page
const FOOTER_H      = 22;    // pt — page number strip at bottom

// Brand-ish colours (RGB) to match the app
const C_ACCENT   = [200, 155, 32];
const C_MUTED    = [110, 118, 132];
const C_BORDER   = [215, 219, 227];
const C_TEXT     = [20,  24,  32];

/**
 * Format a Date as "MMM D, YYYY" using UTC to avoid TZ wobble.
 */
function formatDate(d = new Date()) {
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/**
 * Build a sanitized clone of the live gantt suitable for rasterizing.
 * The clone is absolutely positioned off-screen so it doesn't flash
 * into the user's view during the synchronous layout read.
 */
function buildExportClone(source) {
  const clone = source.cloneNode(true);

  // Drop the toolbar + anything explicitly marked as excluded from export.
  clone.querySelectorAll("[data-gantt-export-exclude]").forEach(el => el.remove());

  // Remove every column-resize drag handle — they're cursor-interactive
  // and the grabber bars look weird in a printed document.
  clone.querySelectorAll('[style*="cursor: col-resize"]').forEach(el => el.remove());

  // Kill scrolling on every overflow container so html2canvas sees the
  // full content, not just the viewport slice.
  clone.querySelectorAll("*").forEach(el => {
    const cs = window.getComputedStyle(el);
    if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      // Push width out so content doesn't wrap / get clipped.
      if (el.scrollWidth > el.clientWidth) el.style.width = `${el.scrollWidth}px`;
      if (el.scrollHeight > el.clientHeight) el.style.minHeight = `${el.scrollHeight}px`;
    }
    // Force any max-heights off so the phase list renders in full.
    el.style.maxHeight = "none";
  });

  // The gantt root itself needs a concrete size — html2canvas uses
  // scrollWidth/Height of the element, but after we removed the scroll
  // limiter the root's natural size is now the full content size.
  clone.style.position = "absolute";
  clone.style.left = "-99999px";
  clone.style.top = "0";
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  // If the source is styled with height:100% the clone won't know its
  // parent height. Give it a big upper bound so layout can compute.
  clone.style.width = `${source.scrollWidth || source.offsetWidth}px`;

  return clone;
}

/**
 * Find the pixel width of the LEFT task-list panel inside the clone —
 * needed later to repeat the left columns on every PDF page.
 */
function detectLeftPanelWidth(cloneRoot) {
  // The left panel is rendered with display:grid and our GRID template;
  // the outermost cell of the synchronized header row has that width.
  // Easiest reliable signal: find the first grid with 10 columns
  // (WBS..%).
  const grids = cloneRoot.querySelectorAll('[style*="display: grid"]');
  for (const g of grids) {
    // Anchor on the synchronized header row — first grid in the flow
    // with multiple column headers.
    if (g.children.length >= 8 && g.offsetWidth > 200 && g.offsetWidth < 1200) {
      return g.offsetWidth;
    }
  }
  return 700; // defensible fallback
}

/**
 * Stamp a title band at the top of the given page.
 */
function drawHeader(pdf, { project, pageIndex, pageCount }) {
  const pageW = pdf.internal.pageSize.getWidth();
  const y = PAGE_MARGIN;

  // Divider under the title
  pdf.setDrawColor(...C_BORDER);
  pdf.setLineWidth(0.75);
  pdf.line(PAGE_MARGIN, y + HEADER_H - 6, pageW - PAGE_MARGIN, y + HEADER_H - 6);

  // Title: "Schedule — <Project>"
  pdf.setTextColor(...C_TEXT);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  const title = `Schedule — ${project?.name || "Project"}`;
  pdf.text(title, PAGE_MARGIN, y + 14);

  // Subtitle: project number · exported date
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...C_MUTED);
  const metaBits = [];
  if (project?.project_number) metaBits.push(`Project #${project.project_number}`);
  metaBits.push(`Exported ${formatDate()}`);
  if (pageCount > 1) metaBits.push(`Page ${pageIndex + 1} of ${pageCount}`);
  pdf.text(metaBits.join("  ·  "), PAGE_MARGIN, y + 28);

  // Accent bar on the right — purely decorative, matches app accent
  pdf.setFillColor(...C_ACCENT);
  pdf.rect(pageW - PAGE_MARGIN - 60, y + 6, 60, 4, "F");
}

function drawFooter(pdf, { pageIndex, pageCount }) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setTextColor(...C_MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(
    `${pageIndex + 1} / ${pageCount}`,
    pageW - PAGE_MARGIN,
    pageH - PAGE_MARGIN / 2,
    { align: "right" },
  );
  pdf.text(
    "SteelBuild Pro",
    PAGE_MARGIN,
    pageH - PAGE_MARGIN / 2,
  );
}

/**
 * Main entry point.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container  — gantt root element (the one
 *   tagged data-gantt-export-root). If omitted, we scan the document.
 * @param {object}      opts.project    — project record (name,
 *   project_number) used in the title bar + filename.
 * @returns {Promise<{pageCount:number, filename:string}>}
 */
export async function exportGanttToPdf({ container, project = {} } = {}) {
  const root = container || document.querySelector("[data-gantt-export-root]");
  if (!root) throw new Error("Gantt container not found — open the Gantt view first.");

  // 1. Build off-screen clone with scrolling flattened.
  const clone = buildExportClone(root);
  document.body.appendChild(clone);

  // Force a layout + one paint before capture so getComputedStyle /
  // scrollWidth reads are settled.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let canvas;
  let leftPanelPx;
  try {
    leftPanelPx = detectLeftPanelWidth(clone);
    canvas = await html2canvas(clone, {
      scale: CAPTURE_SCALE,
      backgroundColor: "#FFFFFF",
      logging: false,
      useCORS: true,
      // html2canvas inherits window width; force the full clone width so
      // no responsive rules collapse anything mid-capture.
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    clone.remove();
  }

  // 2. Build the PDF and tile the canvas across pages.
  const pdf = new jsPDF({
    orientation: PAGE_ORIENT,
    unit: "pt",
    format: PAGE_FORMAT,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const availW = pageW - PAGE_MARGIN * 2;
  const availH = pageH - PAGE_MARGIN - HEADER_H - FOOTER_H;

  // Canvas px → PDF pt scaling. We want the canvas height to match
  // availH (fit vertically) and then slice the width across pages. If
  // the canvas is actually short enough to fit vertically AND
  // horizontally on one page, great — one page it is.
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = availH / ch; // fit full height on one page
  const projectedW = cw * scale;

  if (projectedW <= availW) {
    // Fits on a single page.
    pdf.addImage(canvas, "PNG", PAGE_MARGIN, PAGE_MARGIN + HEADER_H, projectedW, availH);
    drawHeader(pdf, { project, pageIndex: 0, pageCount: 1 });
    drawFooter(pdf, { pageIndex: 0, pageCount: 1 });
  } else {
    // Multi-page: split horizontally. To keep the left panel visible on
    // every page, the LEFT slice is drawn first (width = leftPanelPx in
    // canvas px × scale in pt), and then successive pages scroll the
    // right-panel slice.
    const leftPdfW = leftPanelPx * CAPTURE_SCALE * scale; // render width of left panel in pt
    const rightAvailW = availW - leftPdfW;
    if (rightAvailW < 100) {
      // Left panel eats too much of the page — fall back to single-page
      // with full scaling (accept tiny text rather than crash on zero
      // right-width).
      const fitScale = Math.min(availW / cw, availH / ch);
      pdf.addImage(canvas, "PNG", PAGE_MARGIN, PAGE_MARGIN + HEADER_H, cw * fitScale, ch * fitScale);
      drawHeader(pdf, { project, pageIndex: 0, pageCount: 1 });
      drawFooter(pdf, { pageIndex: 0, pageCount: 1 });
    } else {
      // Pre-split the canvas into the LEFT tile + horizontal slices of
      // the RIGHT tile. All slices share the same height (full ch).
      const leftCanvasPx = leftPanelPx * CAPTURE_SCALE;
      const rightWidthCanvasPx = cw - leftCanvasPx;
      const rightSliceCanvasPx = rightAvailW / scale; // px of source per slice
      const pageCount = Math.max(1, Math.ceil(rightWidthCanvasPx / rightSliceCanvasPx));

      // Pre-cut the LEFT tile once — we'll redraw it on every page.
      const leftTile = cropCanvas(canvas, 0, 0, leftCanvasPx, ch);
      const leftDataUrl = leftTile.toDataURL("image/png");

      for (let i = 0; i < pageCount; i++) {
        if (i > 0) pdf.addPage(PAGE_FORMAT, PAGE_ORIENT);
        drawHeader(pdf, { project, pageIndex: i, pageCount });
        drawFooter(pdf, { pageIndex: i, pageCount });

        // Left tile
        pdf.addImage(leftDataUrl, "PNG", PAGE_MARGIN, PAGE_MARGIN + HEADER_H, leftPdfW, availH);

        // Right slice
        const rightStart = leftCanvasPx + i * rightSliceCanvasPx;
        const rightSliceW = Math.min(rightSliceCanvasPx, cw - rightStart);
        const rightTile = cropCanvas(canvas, rightStart, 0, rightSliceW, ch);
        const rightPdfW = rightSliceW * scale;
        pdf.addImage(
          rightTile.toDataURL("image/png"),
          "PNG",
          PAGE_MARGIN + leftPdfW,
          PAGE_MARGIN + HEADER_H,
          rightPdfW,
          availH,
        );
      }
    }
  }

  // Filename: schedule-<projNum>-<YYYY-MM-DD>.pdf
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const projectKey = project?.project_number || project?.name?.replace(/\s+/g, "_") || "project";
  const filename = `schedule-${projectKey}-${dateKey}.pdf`;
  pdf.save(filename);

  return { pageCount: pdf.internal.getNumberOfPages(), filename };
}

/**
 * Create a new canvas that's a sub-rectangle of `src`. Used to slice the
 * full gantt capture into the pieces that go on each PDF page.
 */
function cropCanvas(src, sx, sy, sw, sh) {
  const out = document.createElement("canvas");
  out.width = Math.round(sw);
  out.height = Math.round(sh);
  const ctx = out.getContext("2d");
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}
