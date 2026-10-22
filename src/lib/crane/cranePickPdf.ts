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
import { presentGeneratedFile, type GeneratedFilePresentation } from "@/lib/native/fileExport";
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
 * Characters the built-in PDF font cannot carry, and what to print instead.
 *
 * jsPDF draws with Helvetica under WinAnsiEncoding and embeds no Unicode font.
 * Everything up to U+00FF comes out verbatim, but a single code point above it
 * makes jsPDF widen the WHOLE string to UTF-16, which the simple Type 1 font
 * then reads byte by byte: `CG\u2192pick` prints as ` C G! p i c k`. It is the
 * line that is lost, not just the character — and the em dash alone appears in
 * every unknown-value placeholder and in every page footer.
 *
 * The shared wording in `pickSummaryFormat` keeps its typography for the screen
 * and the clipboard, which handle it correctly. This is the renderer's own
 * limitation, so the transliteration lives here, at the one boundary that
 * writes to the page.
 */
const PDF_TRANSLITERATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2014\u2013\u2012\u2011]/g, "-"],        // em, en and figure dash; non-breaking hyphen
  [/[\u2018\u2019\u201B\u2032]/g, "'"],        // curly single quotes, prime
  [/[\u201C\u201D\u201F\u2033]/g, '"'],        // curly double quotes, double prime
  [/\u2192/g, "->"],
  [/\u2190/g, "<-"],
  [/\u2265/g, ">="],
  [/\u2264/g, "<="],
  [/\u2260/g, "!="],
  [/\u2248/g, "~"],
  [/\u26A0\uFE0F?/g, "!"],                      // warning sign, with or without the emoji selector
  [/\u2026/g, "..."],
  [/[\u2022\u2027]/g, "\u00B7"],                // bullets collapse onto the middle dot, which WinAnsi has
  [/\u00A0/g, " "],
  [/[\u200B-\u200D\uFEFF]/g, ""],               // zero-width joiners and the BOM
];

/**
 * Make a string safe for the built-in font.
 *
 * The final sweep is the part that matters: free text reaches this sheet — job
 * and crane names, chart references, whatever a detailer typed — so a character
 * nobody listed has to degrade into one legible glyph instead of destroying the
 * line it sits on.
 */
export function pdfSafe(value: unknown): string {
  let out = String(value ?? "");
  for (const [pattern, replacement] of PDF_TRANSLITERATION) out = out.replace(pattern, replacement);
  return out.replace(/[^\u0000-\u00FF]+/g, "?");
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

  // Every write to the page goes through these three — see pdfSafe above.
  const text = (value: unknown, x: number, yy: number) => pdf.text(pdfSafe(value), x, yy);
  const split = (value: unknown, w: number) => pdf.splitTextToSize(pdfSafe(value), w) as string[];
  const width = (value: unknown) => pdf.getTextWidth(pdfSafe(value));

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
  text("PICK SUMMARY", M, 30);
  color([170, 186, 198]);
  font(8.5);
  text(`Crane Pick Calculator · SteelBuild Pro · captured ${capturedLabel(data)}`, M, 46);
  if (options.projectName) {
    font(9, "bold");
    color(C.white);
    const label = String(options.projectName);
    text(label, PW - M - width(label), 30);
  }
  y = 84;

  // ── Disclaimer — leads the page, repeats in the footer ────────────────────
  const discLines = split(DISCLAIMER_BODY, PW - M * 2 - 20);
  const discH = 20 + discLines.length * 11;
  fill(C.infoBg);
  draw(C.accent);
  pdf.setLineWidth(0.8);
  pdf.rect(M, y, PW - M * 2, discH, "FD");
  color(C.accent);
  font(8, "bold");
  text(`${DISCLAIMER_HEAD} —`, M + 10, y + 14);
  color(C.ink);
  font(9);
  discLines.forEach((line, i) => text(line, M + 10, y + 27 + i * 11));
  y += discH + 18;

  // ── Sections ──────────────────────────────────────────────────────────────
  const sectionHeader = (title: string) => {
    need(30);
    color(C.muted);
    font(8, "bold");
    text(title.toUpperCase(), M, y);
    draw(C.rule);
    pdf.setLineWidth(0.6);
    pdf.line(M, y + 5, PW - M, y + 5);
    y += 18;
  };

  const row = (k: string, v: string, opts: { bold?: boolean; note?: boolean } = {}) => {
    const valueWidth = k ? VAL_W : PW - M * 2 - 12;
    font(opts.bold ? 10.5 : 9.5, opts.bold ? "bold" : "normal");
    const lines = split(String(v ?? "—"), valueWidth);
    const h = Math.max(14, lines.length * (opts.bold ? 13 : 12) + 2);
    need(h);

    if (opts.note) {
      // A caveat about the value above it — indented, muted, no label column.
      color(C.muted);
      font(8.5, "normal");
      const noteLines = split(String(v ?? ""), PW - M * 2 - 12);
      need(noteLines.length * 10 + 4);
      noteLines.forEach((line, i) => text(line, M + 12, y + i * 10));
      y += noteLines.length * 10 + 6;
      return;
    }

    if (k) {
      color(C.muted);
      font(8.5, "normal");
      const keyLines = split(k, KEY_W - 8);
      keyLines.forEach((line, i) => text(line, M, y + i * 10));
    }
    color(C.ink);
    font(opts.bold ? 10.5 : 9.5, opts.bold ? "bold" : "normal");
    lines.forEach((line, i) => text(line, VAL_X, y + i * (opts.bold ? 13 : 12)));
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
      const lines = split(String(w.message), PW - M * 2 - 24);
      const h = lines.length * 11 + 12;
      need(h + 4);
      fill(red ? C.redBg : C.amberBg);
      pdf.rect(M, y - 9, PW - M * 2, h, "F");
      fill(red ? C.red : C.amber);
      pdf.rect(M, y - 9, 3, h, "F");
      color(red ? C.red : C.amber);
      font(7.5, "bold");
      text(red ? "CRITICAL" : "CAUTION", M + 12, y + 1);
      color(C.ink);
      font(9);
      lines.forEach((line, i) => text(line, M + 62, y + 1 + i * 11));
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
    text(label.toUpperCase(), x, y + 34);
    pdf.line(x, y + 52, x + colW, y + 52);
    text("DATE", x, y + 62);
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
    text(`${DISCLAIMER_HEAD} — ${DISCLAIMER_BODY}`, M, PH - 32);
    const pageLabel = `Page ${p} of ${pages}`;
    text(pageLabel, PW - M - width(pageLabel), PH - 32);
  }

  return pdf;
}

/** Filename like `Pick-Summary-2026-10-21.pdf`, or with the job when known. */
export function cranePickPdfFilename(data: PickSnapshot, options: CranePickPdfOptions = {}): string {
  const when = options.now instanceof Date ? options.now : new Date();
  const job = String(options.projectName ?? "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return `Pick-Summary-${job ? `${job}-` : ""}${stamp(when)}.pdf`;
}

/**
 * Build and hand the PDF to the browser (or the native share sheet), resolving
 * to what actually happened.
 *
 * `presentGeneratedFile` reports `"cancelled"` and `"failed"` by returning them
 * rather than throwing, so a caller that discards this promise cannot tell a
 * saved sheet from a refused one — and would claim success for both. Callers
 * announce the export only on `"downloaded"` or `"shared"`.
 */
export async function downloadCranePickPdf(
  data: PickSnapshot,
  options: CranePickPdfOptions = {},
): Promise<GeneratedFilePresentation> {
  const pdf = buildCranePickPdf(data, options);
  return presentGeneratedFile({
    blob: pdf.output("blob") as Blob,
    filename: cranePickPdfFilename(data, options),
    title: "Pick Summary",
  });
}
