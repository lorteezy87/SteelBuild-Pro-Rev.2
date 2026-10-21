/**
 * cranePickPdf.ts — the Pick Summary as a PDF a lift plan can carry.
 *
 * Renders the SAME sections the on-screen summary and the clipboard text come
 * from (lib/crane/pickSummaryFormat), so the printed sheet cannot disagree with
 * the screen it was taken from. This module adds no engineering values: every
 * figure arrives already computed and already worded.
 *
 * The sheet is built for the field — the planning-tool disclaimer leads the
 * page and repeats in the footer, chart provenance is printed next to the
 * capacity it produced, warnings are colour-coded, and a sign-off block lets
 * the lift director and operator put their names on the plan they used.
 */
import { jsPDF } from "jspdf";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import {
  pickSummarySections,
  pickWarnings,
  capturedLabel,
  DISCLAIMER_HEAD,
  DISCLAIMER_BODY,
  type PickSnapshot,
} from "./pickSummaryFormat";

const C = {
  ink: [17, 24, 31] as [number, number, number],
  muted: [105, 118, 128] as [number, number, number],
  rule: [205, 213, 220] as [number, number, number],
  band: [22, 35, 46] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  accent: [27, 94, 156] as [number, number, number],
  infoBg: [233, 241, 248] as [number, number, number],
  red: [194, 59, 34] as [number, number, number],
  redBg: [250, 228, 223] as [number, number, number],
  amber: [168, 116, 0] as [number, number, number],
  amberBg: [247, 235, 210] as [number, number, number],
};

const PW = 612;          // US Letter, points
const PH = 792;
const M = 48;            // page margin
const KEY_W = 168;       // label column
const VAL_X = M + KEY_W;
const VAL_W = PW - M - VAL_X;
const BOTTOM = PH - 58;  // keep clear of the footer

export interface CranePickPdfOptions {
  /** Job / project name printed in the header, when the caller knows it. */
  projectName?: string;
  /** Injected in tests so the filename and header stamp are deterministic. */
  now?: Date;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Build the PDF. Returns the jsPDF document so a caller can save, share or
 * inspect it; `downloadCranePickPdf` wraps this for the normal case.
 */
export function buildCranePickPdf(data: PickSnapshot, options: CranePickPdfOptions = {}): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const font = (size: number, weight: "normal" | "bold" = "normal") => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", weight);
  };
  const color = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
  const fill = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const draw = (c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);

  let y = 0;

  /** Start a fresh page and reset the cursor below the top margin. */
  const newPage = () => {
    pdf.addPage();
    y = M;
  };
  /** Reserve `h` points; break the page first if they do not fit. */
  const need = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  // ── Header band ───────────────────────────────────────────────────────────
  fill(C.band);
  pdf.rect(0, 0, PW, 62, "F");
  color(C.white);
  font(17, "bold");
  pdf.text("PICK SUMMARY", M, 30);
  color([170, 186, 198]);
  font(8.5);
  pdf.text(`Crane Pick Calculator · SteelBuild Pro · captured ${capturedLabel(data)}`, M, 46);
  if (options.projectName) {
    font(9, "bold");
    color(C.white);
    const label = String(options.projectName);
    pdf.text(label, PW - M - pdf.getTextWidth(label), 30);
  }
  y = 84;

  // ── Disclaimer — leads the page, repeats in the footer ────────────────────
  const discLines = pdf.splitTextToSize(DISCLAIMER_BODY, PW - M * 2 - 20) as string[];
  const discH = 20 + discLines.length * 11;
  fill(C.infoBg);
  draw(C.accent);
  pdf.setLineWidth(0.8);
  pdf.rect(M, y, PW - M * 2, discH, "FD");
  color(C.accent);
  font(8, "bold");
  pdf.text(`${DISCLAIMER_HEAD} —`, M + 10, y + 14);
  color(C.ink);
  font(9);
  discLines.forEach((line, i) => pdf.text(line, M + 10, y + 27 + i * 11));
  y += discH + 18;

  // ── Sections ──────────────────────────────────────────────────────────────
  const sectionHeader = (title: string) => {
    need(30);
    color(C.muted);
    font(8, "bold");
    pdf.text(title.toUpperCase(), M, y);
    draw(C.rule);
    pdf.setLineWidth(0.6);
    pdf.line(M, y + 5, PW - M, y + 5);
    y += 18;
  };

  const row = (k: string, v: string, opts: { bold?: boolean; note?: boolean } = {}) => {
    const valueWidth = k ? VAL_W : PW - M * 2 - 12;
    font(opts.bold ? 10.5 : 9.5, opts.bold ? "bold" : "normal");
    const lines = pdf.splitTextToSize(String(v ?? "—"), valueWidth) as string[];
    const h = Math.max(14, lines.length * (opts.bold ? 13 : 12) + 2);
    need(h);

    if (opts.note) {
      // A caveat about the value above it — indented, muted, no label column.
      color(C.muted);
      font(8.5, "normal");
      const noteLines = pdf.splitTextToSize(String(v ?? ""), PW - M * 2 - 12) as string[];
      need(noteLines.length * 10 + 4);
      noteLines.forEach((line, i) => pdf.text(line, M + 12, y + i * 10));
      y += noteLines.length * 10 + 6;
      return;
    }

    if (k) {
      color(C.muted);
      font(8.5, "normal");
      const keyLines = pdf.splitTextToSize(k, KEY_W - 8) as string[];
      keyLines.forEach((line, i) => pdf.text(line, M, y + i * 10));
    }
    color(C.ink);
    font(opts.bold ? 10.5 : 9.5, opts.bold ? "bold" : "normal");
    lines.forEach((line, i) => pdf.text(line, VAL_X, y + i * (opts.bold ? 13 : 12)));
    y += h;
  };

  for (const section of pickSummarySections(data)) {
    sectionHeader(section.title);
    for (const r of section.rows) row(r.k, r.v, { bold: r.bold, note: r.note });
    y += 10;
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings = pickWarnings(data);
  if (warnings.length) {
    sectionHeader("Warnings");
    for (const w of warnings) {
      const red = w.severity === "red";
      font(9);
      const lines = pdf.splitTextToSize(String(w.message), PW - M * 2 - 24) as string[];
      const h = lines.length * 11 + 12;
      need(h + 4);
      fill(red ? C.redBg : C.amberBg);
      pdf.rect(M, y - 9, PW - M * 2, h, "F");
      fill(red ? C.red : C.amber);
      pdf.rect(M, y - 9, 3, h, "F");
      color(red ? C.red : C.amber);
      font(7.5, "bold");
      pdf.text(red ? "CRITICAL" : "CAUTION", M + 12, y + 1);
      color(C.ink);
      font(9);
      lines.forEach((line, i) => pdf.text(line, M + 62, y + 1 + i * 11));
      y += h + 6;
    }
    y += 4;
  }

  // ── Sign-off — a lift plan is a document people put their name on ─────────
  need(84);
  sectionHeader("Reviewed");
  const colW = (PW - M * 2 - 24) / 3;
  ["Prepared by", "Lift director / Supervisor", "Crane operator"].forEach((label, i) => {
    const x = M + i * (colW + 12);
    draw(C.rule);
    pdf.setLineWidth(0.6);
    pdf.line(x, y + 24, x + colW, y + 24);
    color(C.muted);
    font(7.5, "bold");
    pdf.text(label.toUpperCase(), x, y + 34);
    pdf.line(x, y + 52, x + colW, y + 52);
    pdf.text("DATE", x, y + 62);
  });
  y += 70;

  // ── Footer on every page ──────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    draw(C.rule);
    pdf.setLineWidth(0.6);
    pdf.line(M, PH - 44, PW - M, PH - 44);
    color(C.muted);
    font(7.5);
    pdf.text(`${DISCLAIMER_HEAD} — ${DISCLAIMER_BODY}`, M, PH - 32);
    const pageLabel = `Page ${p} of ${pages}`;
    pdf.text(pageLabel, PW - M - pdf.getTextWidth(pageLabel), PH - 32);
  }

  return pdf;
}

/** Filename like `Pick-Summary-2026-10-21.pdf`, or with the job when known. */
export function cranePickPdfFilename(data: PickSnapshot, options: CranePickPdfOptions = {}): string {
  const when = options.now instanceof Date ? options.now : new Date();
  const job = String(options.projectName ?? "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return `Pick-Summary-${job ? `${job}-` : ""}${stamp(when)}.pdf`;
}

/** Build and hand the PDF to the browser (or the native share sheet). */
export function downloadCranePickPdf(data: PickSnapshot, options: CranePickPdfOptions = {}): jsPDF {
  const pdf = buildCranePickPdf(data, options);
  void presentGeneratedFile({
    blob: pdf.output("blob") as Blob,
    filename: cranePickPdfFilename(data, options),
    title: "Pick Summary",
  });
  return pdf;
}
