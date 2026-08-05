/**
 * revisionImpactPDF.js — render the package-level Revision Impact Report to a
 * shareable PDF (jsPDF). Same data the modal shows: severity rollup + per-sheet
 * AI deltas + downstream rework exposure. A review-only artifact meant to attach
 * to a transmittal / email so the GC or detailer sees exactly what changed in a
 * revision and what it touches downstream.
 *
 * Dependency-light + React-free: only jsPDF, text + simple shapes (no images /
 * html2canvas). `now` is injected so the generated date is deterministic in tests.
 */
import { jsPDF } from "jspdf";

const SEV_ORDER = ["critical", "high", "medium", "low", "info"];
const SEV_RGB = {
  critical: [248, 81, 73], high: [240, 136, 62], medium: [210, 153, 34],
  low: [63, 185, 80], info: [139, 148, 158],
};
// Mirrors RevisionDeltaCard's DELTA_LABEL; inlined so this stays a React-free lib.
const DELTA_LABEL = {
  grid_shift: "Grid shift", connection_change: "Connection", dimension_change: "Dimension",
  detail_revised: "Detail", callout_added: "Callout +", callout_removed: "Callout -",
  material_change: "Material", elevation_change: "Elevation", sheet_added: "Sheet +",
  sheet_removed: "Sheet -", other: "Other",
};

// Local YYYY-MM-DD (NOT toISOString — that's UTC and rolls over wrong after ~5pm MST).
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build the report PDF.
 * @param {object} args
 * @param {{name?: string}} [args.set]                drawing set package
 * @param {Array} [args.results]   per-sheet results: { sheetNumber, downstream,
 *   renderable, error?, deltas: [{ severity, delta_type, description, recommended_action, dismissed }] }
 * @param {object} [args.summary]  summarizePackageReport() output
 * @param {string} [args.projectName]
 * @param {Date}   [args.now]
 * @returns {jsPDF} the document (caller decides save()/output()).
 */
export function buildRevisionImpactPdf({ set, results = [], summary, projectName = "", now = new Date() } = {}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 48;
  const RIGHT = W - M;
  let y = M;

  const ensure = (need) => { if (y + need > H - M) { pdf.addPage(); y = M; } };
  const rule = () => { pdf.setDrawColor(210); pdf.setLineWidth(0.6); pdf.line(M, y, RIGHT, y); };
  const para = (text, { x = M, size = 10, color = [55, 55, 55], gap = 13, bold = false, indent = 0 } = {}) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(String(text ?? ""), RIGHT - x - indent);
    ensure(lines.length * gap);
    pdf.text(lines, x + indent, y);
    y += lines.length * gap;
  };

  // ── Header ────────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.setTextColor(20);
  pdf.text("Revision Impact Report", M, y); y += 20;
  para([set?.name || "Drawing set", projectName].filter(Boolean).join("   •   "), { size: 10, color: [90, 90, 90] });
  para(`Generated ${fmtDate(now)}   •   AI-assisted, review-only`, { size: 8, color: [135, 135, 135], gap: 12 });
  rule(); y += 16;

  // ── Summary ───────────────────────────────────────────────────────────
  if (summary) {
    para("Summary", { size: 11, bold: true, color: [20, 20, 20], gap: 15 });
    para(`${summary.totalDeltas || 0} change${summary.totalDeltas === 1 ? "" : "s"} across ${summary.sheetsDiffed || 0}/${summary.sheetsChanged || 0} changed sheets.`, { gap: 14 });
    if (summary.downstreamExposure > 0) {
      para(`${summary.downstreamExposure} sheet${summary.downstreamExposure === 1 ? "" : "s"} with high-severity changes are already downstream (fabricated / delivered / installed) — rework risk.`, { color: [200, 40, 40], gap: 14 });
    }
    if (summary.sheetsBlocked > 0) {
      para(`${summary.sheetsBlocked} changed sheet${summary.sheetsBlocked === 1 ? "" : "s"} had no prior file to compare against.`, { color: [120, 120, 120], gap: 14 });
    }
    const chips = SEV_ORDER.filter((s) => (summary.bySeverity?.[s] || 0) > 0);
    if (chips.length) {
      ensure(16); let x = M; y += 2;
      for (const s of chips) {
        const [r, g, b] = SEV_RGB[s];
        pdf.setFillColor(r, g, b); pdf.circle(x + 3, y - 3, 3, "F");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(70, 70, 70);
        const t = `${summary.bySeverity[s]} ${s.toUpperCase()}`;
        pdf.text(t, x + 10, y);
        x += 12 + pdf.getTextWidth(t) + 16;
      }
      y += 16;
    }
    y += 4; rule(); y += 16;
  }

  // ── Per-sheet sections ────────────────────────────────────────────────
  for (const r of results || []) {
    if (!r) continue;
    const kept = (r.deltas || []).filter((d) => d && !d.dismissed);
    ensure(34);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(20);
    const sheetName = r.sheetNumber || "Sheet";
    pdf.text(sheetName, M, y);
    if (r.downstream) {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(200, 40, 40);
      pdf.text(String(r.downstream).toUpperCase(), M + pdf.getTextWidth(sheetName) + 8, y);
    }
    y += 15;

    if (r.error) {
      para(`Error: ${r.error}`, { color: [180, 40, 40], indent: 8 });
    } else if (!r.renderable) {
      para("Changed, but no captured prior-revision file to compare against.", { color: [120, 120, 120], indent: 8 });
    } else if (kept.length === 0) {
      para("No material changes detected.", { color: [120, 120, 120], indent: 8 });
    } else {
      for (const d of kept) {
        const [cr, cg, cb] = SEV_RGB[d.severity] || SEV_RGB.info;
        const label = DELTA_LABEL[d.delta_type] || d.delta_type || "Change";
        const head = `${String(d.severity || "info").toUpperCase()}  •  ${label}`;
        ensure(14);
        pdf.setFillColor(cr, cg, cb); pdf.circle(M + 6, y - 3, 2.6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.setTextColor(cr, cg, cb);
        pdf.text(head, M + 14, y); y += 12;
        para(d.description || "(no description)", { indent: 14, size: 9.5, color: [40, 40, 40], gap: 12 });
        if (d.recommended_action) {
          para(`→ ${d.recommended_action}`, { indent: 20, size: 9, color: [110, 110, 110], gap: 11 });
        }
        y += 6;
      }
    }
    y += 10;
  }

  // ── Footer on every page ──────────────────────────────────────────────
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
    pdf.text("SteelBuild Pro — Revision Impact Report", M, H - 24);
    pdf.text(`${i} / ${pages}`, RIGHT, H - 24, { align: "right" });
  }

  return pdf;
}

/** Build + trigger a browser download. Filename derives from the set name + date. */
export function downloadRevisionImpactPdf(args = {}) {
  const pdf = buildRevisionImpactPdf(args);
  const safe = (String(args?.set?.name || "drawing-set").replace(/[^\w.-]+/g, "_").slice(0, 60)) || "drawing-set";
  const stamp = fmtDate(args?.now instanceof Date ? args.now : new Date());
  pdf.save(`Revision-Impact-${safe}-${stamp}.pdf`);
  return pdf;
}
