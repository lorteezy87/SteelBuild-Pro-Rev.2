/**
 * defensePdf.js — the backcharge defense package as a polished PDF (the document
 * you hand a sub/vendor or counsel). Client-side via jsPDF (no autotable — the
 * table is laid out manually). Mirrors the structured manifest CSV
 * (defensePackage.ts) but formatted for print: header, basis, T&M cost build-up,
 * and the timestamped audit trail that substantiates timely notice.
 */
import { jsPDF } from "jspdf";
import { formatLocalDate } from "@/utils/dates";
import { computeBackchargeAmount, computeTmTicketTotal, sumTmTickets } from "./cost";
import { BACKCHARGE_REASON_LABELS, BACKCHARGE_STATUS_LABELS } from "./types";

const C = {
  black: [15, 17, 24],
  accent: [0, 175, 215],
  muted: [100, 110, 130],
  border: [210, 215, 225],
  rowEven: [245, 247, 250],
  errorFill: [254, 242, 242],
  error: [220, 38, 38],
  white: [255, 255, 255],
};

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d) => (d ? formatLocalDate(d) : "—");
const label = (map, key, fb = "—") => (key ? map[key] || key : fb);

/**
 * @returns {jsPDF} the document (caller calls `.save(filename)` / `.output(...)`).
 */
export function buildDefensePdf({ backcharge, tickets = [], events = [], project = {} } = {}) {
  const bc = backcharge || {};
  const live = (tickets || []).filter((t) => t && !t.is_deleted);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PAGE_W = 612, PAGE_H = 792, M = 48, CW = PAGE_W - M * 2;

  const font = (size, weight = "normal") => { pdf.setFontSize(size); pdf.setFont("helvetica", weight === "bold" ? "bold" : "normal"); };
  const color = (rgb) => pdf.setTextColor(...rgb);
  const fill = (rgb) => pdf.setFillColor(...rgb);
  const draw = (rgb) => pdf.setDrawColor(...rgb);
  let y = M;
  const brk = (need = 24) => { if (y + need > PAGE_H - M) { pdf.addPage(); y = M; } };

  // ── Title bar ──────────────────────────────────────────────────────────────
  fill(C.black); pdf.rect(0, 0, PAGE_W, 64, "F");
  color(C.white); font(16, "bold");
  pdf.text("BACKCHARGE DEFENSE PACKAGE", M, 34);
  color([180, 190, 205]); font(9);
  pdf.text((project?.name || project?.project_number || "").toString(), M, 50);
  color(C.accent); font(9, "bold");
  pdf.text(money(computeBackchargeAmount(bc, live)), PAGE_W - M, 34, { align: "right" });
  color([180, 190, 205]); font(8);
  pdf.text("Amount claimed", PAGE_W - M, 48, { align: "right" });
  y = 86;

  // ── Header fields ────────────────────────────────────────────────────────
  const row = (k, v, opts = {}) => {
    brk(18);
    font(8, "bold"); color(C.muted); pdf.text(String(k).toUpperCase(), M, y);
    font(10); color(opts.tone || C.black);
    const lines = pdf.splitTextToSize(String(v ?? "—"), CW - 130);
    pdf.text(lines, M + 130, y);
    y += Math.max(16, lines.length * 13);
  };
  font(13, "bold"); color(C.black);
  pdf.text(`${bc.backcharge_number ? bc.backcharge_number + " — " : ""}${bc.title || "(untitled)"}`, M, y);
  y += 20;
  row("Status", label(BACKCHARGE_STATUS_LABELS, bc.status));
  row("Against", `${bc.responsible_party || "(unspecified)"}  (${bc.responsible_party_type || "—"})`);
  row("Reason", label(BACKCHARGE_REASON_LABELS, bc.reason_code));
  if (bc.linked_co_number) row("Linked CO", bc.linked_co_number);
  if (bc.source_rfi_number) row("Source RFI", bc.source_rfi_number);
  row("Incident date", dt(bc.incident_date));
  if (bc.notice_date) {
    row("Notice date", dt(bc.notice_date));
  } else {
    row("Notice date", "NO NOTICE ON RECORD — capture to strengthen this claim", { tone: C.error });
  }
  y += 6;

  // ── Basis ────────────────────────────────────────────────────────────────
  brk(40); font(10, "bold"); color(C.accent); pdf.text("BASIS", M, y); y += 14;
  font(9); color(C.black);
  const basis = pdf.splitTextToSize(bc.description || "(no description provided)", CW);
  pdf.text(basis, M, y); y += basis.length * 12 + 10;

  // ── T&M cost build-up table ──────────────────────────────────────────────
  brk(50); font(10, "bold"); color(C.accent); pdf.text("T&M COST BUILD-UP", M, y); y += 14;
  const cols = [
    { k: "date", w: 56, label: "Date" },
    { k: "desc", w: 168, label: "Description" },
    { k: "hrs", w: 40, label: "Hrs", align: "right" },
    { k: "rate", w: 50, label: "Rate", align: "right" },
    { k: "equip", w: 56, label: "Equip", align: "right" },
    { k: "matl", w: 56, label: "Matl", align: "right" },
    { k: "amt", w: 68, label: "Amount", align: "right" },
  ];
  const drawRow = (cells, opts = {}) => {
    brk(18);
    if (opts.fillRow) { fill(opts.fillRow); pdf.rect(M, y - 11, CW, 16, "F"); }
    font(opts.bold ? 8 : 8, opts.bold ? "bold" : "normal"); color(opts.tone || C.black);
    let x = M;
    for (const c of cols) {
      const txt = String(cells[c.k] ?? "");
      const tx = c.align === "right" ? x + c.w - 4 : x + 3;
      pdf.text(pdf.splitTextToSize(txt, c.w - 6)[0] || "", tx, y, { align: c.align || "left" });
      x += c.w;
    }
    y += 16;
  };
  fill(C.black); pdf.rect(M, y - 11, CW, 16, "F"); color(C.white); font(8, "bold");
  { let x = M; for (const c of cols) { pdf.text(c.label, c.align === "right" ? x + c.w - 4 : x + 3, y, { align: c.align || "left" }); x += c.w; } }
  y += 16;
  if (live.length === 0) {
    font(9); color(C.muted); pdf.text("No T&M tickets recorded.", M + 3, y); y += 16;
  } else {
    live.forEach((t, i) => drawRow({
      date: dt(t.ticket_date),
      desc: t.description || t.ticket_number || "T&M",
      hrs: t.labor_hours ? String(t.labor_hours) : "",
      rate: t.labor_rate ? money(t.labor_rate) : "",
      equip: t.equipment_cost ? money(t.equipment_cost) : "",
      matl: t.material_cost ? money(t.material_cost) : "",
      amt: money(computeTmTicketTotal(t)),
    }, { fillRow: i % 2 === 1 ? C.rowEven : null }));
    drawRow({ desc: "TOTAL T&M", amt: money(sumTmTickets(live)) }, { bold: true });
  }
  y += 12;

  // ── Audit trail ──────────────────────────────────────────────────────────
  brk(40); font(10, "bold"); color(C.accent); pdf.text("AUDIT TRAIL", M, y);
  font(8); color(C.muted); pdf.text("(timestamped — substantiates timely notice & documentation)", M + 92, y); y += 14;
  if ((events || []).length === 0) {
    font(9); color(C.muted); pdf.text("No events recorded.", M, y); y += 14;
  } else {
    for (const e of events) {
      brk(14);
      font(8); color(C.muted);
      pdf.text(e.created_at ? formatLocalDate(e.created_at) : "", M, y);
      font(8, "bold"); color(C.black); pdf.text(String(e.event_type || ""), M + 86, y);
      font(8); color(C.black);
      const detail = `${e.from_status ? `${e.from_status} → ${e.to_status} ` : ""}${e.detail || ""}`;
      pdf.text(pdf.splitTextToSize(detail, CW - 200)[0] || "", M + 200, y);
      y += 13;
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    font(7); color(C.muted);
    pdf.text("Generated by SteelBuild Pro — structured backcharge defense package.", M, PAGE_H - 24);
    pdf.text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 24, { align: "right" });
  }
  return pdf;
}
