/**
 * generateTransmittal.js
 * Client-side transmittal PDF using jsPDF.
 * Produces a clean, professionally formatted construction transmittal letter.
 */
import { jsPDF } from "jspdf";

// ── Color palette (RGB) ──────────────────────────────────────────────────────
const C = {
  black:      [15,  17,  24],
  accent:     [0,  175, 215],   // steel blue
  muted:      [100, 110, 130],
  border:     [210, 215, 225],
  rowEven:    [245, 247, 250],
  rowOdd:     [255, 255, 255],
  errorFill:  [254, 242, 242],
  warnFill:   [255, 251, 235],
  successFill:[240, 253, 244],
  white:      [255, 255, 255],
};

const STATUS_COLOR = {
  "Approved":          [22, 163, 74],
  "Approved as Noted": [22, 163, 74],
  "Under Review":      [37, 99, 235],
  "Revise & Resubmit": [202, 138, 4],
  "Rejected":          [220, 38, 38],
  "Draft":             [100, 116, 139],
};

function statusColor(s) { return STATUS_COLOR[s] || C.muted; }

/**
 * @param {object} opts
 * @param {object} opts.project   — project record
 * @param {object[]} opts.docs    — selected document records
 * @param {string} opts.issuedTo  — recipient name/company
 * @param {string} opts.issuedBy  — sender name
 * @param {string} opts.purpose   — e.g. "For Review", "For Approval", "For Construction"
 * @param {string} opts.notes     — optional transmittal notes
 * @param {string} opts.transmittalNumber — e.g. "T-001"
 */
export function generateTransmittal({
  project = {},
  docs = [],
  issuedTo = "",
  issuedBy = "",
  purpose = "For Review",
  notes = "",
  transmittalNumber = "",
}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let y = MARGIN;

  // ── Helper: setFont shorthand ────────────────────────────────────────────
  const font = (size, weight = "normal", style = "normal") => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", weight === "bold" ? "bold" : "normal");
  };

  const color = (rgb) => pdf.setTextColor(...rgb);
  const fill  = (rgb) => pdf.setFillColor(...rgb);
  const draw  = (rgb) => pdf.setDrawColor(...rgb);

  // ── Top accent bar ───────────────────────────────────────────────────────
  fill(C.accent);
  pdf.rect(0, 0, PAGE_W, 6, "F");

  // ── Header: Company + Title ──────────────────────────────────────────────
  y = 30;

  // Left: Company name
  font(20, "bold");
  color(C.black);
  pdf.text("S&H Steel", MARGIN, y);

  font(8);
  color(C.muted);
  pdf.text("Structural Steel Construction", MARGIN, y + 14);
  pdf.text("steelbuildpro.com", MARGIN, y + 26);

  // Right: TRANSMITTAL label
  font(22, "bold");
  color(C.accent);
  pdf.text("TRANSMITTAL", PAGE_W - MARGIN, y, { align: "right" });

  font(9);
  color(C.muted);
  if (transmittalNumber) {
    pdf.text(`# ${transmittalNumber}`, PAGE_W - MARGIN, y + 16, { align: "right" });
  }
  pdf.text(today, PAGE_W - MARGIN, y + 28, { align: "right" });

  y = 80;

  // ── Divider ──────────────────────────────────────────────────────────────
  draw(C.border);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 14;

  // ── Project Info block ───────────────────────────────────────────────────
  const infoLeft  = MARGIN;
  const infoRight = MARGIN + CONTENT_W / 2 + 8;

  const infoRow = (label, value, x, yPos) => {
    font(7, "bold");
    color(C.muted);
    pdf.text(label.toUpperCase(), x, yPos);
    font(9);
    color(C.black);
    pdf.text(String(value || "—"), x, yPos + 11);
  };

  infoRow("Project", project.name || "—",                    infoLeft,  y);
  infoRow("Job #",   project.project_number || "—",          infoRight, y);
  y += 30;
  infoRow("Issued To", issuedTo || "—",                      infoLeft,  y);
  infoRow("Issued By", issuedBy || "—",                      infoRight, y);
  y += 30;
  infoRow("Purpose",   purpose,                              infoLeft,  y);
  infoRow("GC",        project.general_contractor || "—",    infoRight, y);
  y += 36;

  // ── Documents table ──────────────────────────────────────────────────────
  // Table header
  const COL = {
    num:   { x: MARGIN,            w: 24, align: "right" },
    doc:   { x: MARGIN + 28,       w: 44 },
    title: { x: MARGIN + 76,       w: 190 },
    disc:  { x: MARGIN + 270,      w: 80 },
    rev:   { x: MARGIN + 354,      w: 30, align: "center" },
    status:{ x: MARGIN + 388,      w: 90 },
    date:  { x: MARGIN + 482,      w: 82, align: "right" },
  };

  const TABLE_H = 18;

  // Header row background
  fill(C.black);
  pdf.rect(MARGIN, y, CONTENT_W, TABLE_H, "F");

  font(7, "bold");
  color(C.white);
  const headers = [
    ["#",          COL.num],
    ["DOC #",      COL.doc],
    ["TITLE / FILE", COL.title],
    ["DISCIPLINE", COL.disc],
    ["REV",        COL.rev],
    ["STATUS",     COL.status],
    ["DATE",       COL.date],
  ];
  headers.forEach(([label, col]) => {
    const textX = col.align === "right"
      ? col.x + col.w - 2
      : col.align === "center"
      ? col.x + col.w / 2
      : col.x + 4;
    pdf.text(label, textX, y + 12, { align: col.align || "left" });
  });

  y += TABLE_H;

  // Data rows
  docs.forEach((doc, i) => {
    const rowH = 20;

    // Alternate background
    fill(i % 2 === 0 ? C.rowEven : C.rowOdd);
    pdf.rect(MARGIN, y, CONTENT_W, rowH, "F");

    // Row border
    draw(C.border);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y + rowH, PAGE_W - MARGIN, y + rowH);

    font(8);
    color(C.muted);
    // #
    pdf.text(String(i + 1), COL.num.x + COL.num.w - 2, y + 13, { align: "right" });

    // Doc number
    color(C.accent);
    font(8, "bold");
    const docNum = doc.document_number || doc.documentNumber || "—";
    pdf.text(docNum.slice(0, 8), COL.doc.x + 2, y + 13);

    // Title
    font(8);
    color(C.black);
    const title = (doc.display_name || doc.displayName || doc.file_name || doc.fileName || "—");
    const titleTrimmed = title.length > 36 ? title.slice(0, 35) + "…" : title;
    pdf.text(titleTrimmed, COL.title.x + 2, y + 13);

    // Discipline
    color(C.muted);
    font(7);
    pdf.text((doc.discipline || "—").slice(0, 12), COL.disc.x + 2, y + 13);

    // Rev
    color(C.black);
    font(8, "bold");
    const rev = doc.revision_number || doc.revisionNumber || "0";
    pdf.text(`R${rev}`, COL.rev.x + COL.rev.w / 2, y + 13, { align: "center" });

    // Status pill — colored text
    const sc = statusColor(doc.status);
    color(sc);
    font(7, "bold");
    pdf.text((doc.status || "Draft").slice(0, 18), COL.status.x + 2, y + 13);

    // Date
    color(C.muted);
    font(7);
    const d = doc.revision_date || doc.revisionDate || doc.uploaded_date || "";
    const dateStr = d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";
    pdf.text(dateStr, COL.date.x + COL.date.w - 2, y + 13, { align: "right" });

    y += rowH;

    // Page break safety
    if (y > PAGE_H - 120) {
      pdf.addPage();
      y = MARGIN;
    }
  });

  y += 16;

  // ── Notes section ────────────────────────────────────────────────────────
  if (notes.trim()) {
    font(7, "bold");
    color(C.muted);
    pdf.text("NOTES", MARGIN, y);
    y += 12;

    font(9);
    color(C.black);
    const noteLines = pdf.splitTextToSize(notes.trim(), CONTENT_W);
    pdf.text(noteLines, MARGIN, y);
    y += noteLines.length * 12 + 8;
  }

  // ── Signature block ──────────────────────────────────────────────────────
  y += 12;
  draw(C.border);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 20;

  const sigColW = CONTENT_W / 2 - 16;

  // Left: Issued by
  font(7, "bold");
  color(C.muted);
  pdf.text("ISSUED BY", MARGIN, y);
  y += 16;
  draw(C.border);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y, MARGIN + sigColW, y);
  font(8);
  color(C.black);
  pdf.text(issuedBy || "", MARGIN, y + 12);
  font(7);
  color(C.muted);
  pdf.text("Signature / Name", MARGIN, y + 22);

  // Right: Received by
  const sigRightX = PAGE_W - MARGIN - sigColW;
  y -= 16;
  font(7, "bold");
  color(C.muted);
  pdf.text("RECEIVED BY", sigRightX, y);
  y += 16;
  pdf.line(sigRightX, y, PAGE_W - MARGIN, y);
  font(7);
  color(C.muted);
  pdf.text("Signature / Date", sigRightX, y + 22);

  y += 40;

  // ── Footer ───────────────────────────────────────────────────────────────
  fill(C.accent);
  pdf.rect(0, PAGE_H - 28, PAGE_W, 28, "F");

  font(7);
  color(C.white);
  pdf.text(
    `SteelBuild Pro  ·  ${project.name || "Project"}  ·  Transmittal ${transmittalNumber || ""}  ·  ${today}`,
    PAGE_W / 2,
    PAGE_H - 10,
    { align: "center" }
  );

  // ── Save ─────────────────────────────────────────────────────────────────
  const filename = `Transmittal_${(transmittalNumber || "T001").replace(/\s/g, "_")}_${project.project_number || "PRJ"}.pdf`;
  pdf.save(filename);
}
