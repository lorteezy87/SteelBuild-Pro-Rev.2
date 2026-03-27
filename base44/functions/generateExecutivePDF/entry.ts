/**
 * generateExecutivePDF
 * Generates a weekly executive summary PDF for one or all projects.
 *
 * POST payload:
 *   { project_id?: string }   — omit to generate for all projects (returns zip/array)
 *                               include to generate for a single project (returns PDF bytes)
 *
 * Returns:
 *   Single project  → application/pdf  (Content-Disposition: attachment)
 *   All projects    → application/json  { reports: [{ project_name, file_url }] }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function fmtDate(str) {
  if (!str) return '—';
  try {
    return new Date(str + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch { return str; }
}

function fmtPct(n, d) { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—'; }

function computeCPI(wps) {
  const ev = wps.reduce((s, wp) => {
    const bac = (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
    return s + bac * ((Number(wp.percent_complete) || 0) / 100);
  }, 0);
  const ac = wps.reduce((s, wp) =>
    s + (Number(wp.actual_labor_cost_to_date) || 0) + (Number(wp.actual_material_cost_to_date) || 0), 0);
  const cpi = ac > 0 ? ev / ac : null;
  return { ev, ac, cpi };
}

// ── PDF Builder ───────────────────────────────────────────────────────────────

function buildPDF(project, wps, cos, rfis, codes) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9; // letter width mm
  const margin = 18;
  const col2 = W / 2 + 4;
  let y = 0;

  // ── Color palette ──
  const NAVY  = [10, 15, 30];
  const TEAL  = [0, 180, 220];
  const GREEN = [0, 200, 110];
  const RED   = [230, 40, 60];
  const AMBER = [255, 175, 0];
  const GREY  = [100, 110, 130];
  const LGREY = [230, 235, 240];
  const WHITE = [255, 255, 255];

  const setFont = (size, style = 'normal', rgb = [30, 35, 50]) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...rgb);
  };

  // ── Header band ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, 'F');

  // Accent line
  doc.setFillColor(...TEAL);
  doc.rect(0, 38, W, 1.5, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text('WEEKLY EXECUTIVE SUMMARY', margin, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 195, 215);
  doc.text(`${project.name}  ·  ${project.project_number || ''}`, margin, 22);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 29);

  if (project.phase) {
    doc.setFillColor(...TEAL);
    doc.roundedRect(W - margin - 28, 8, 28, 8, 2, 2, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text(project.phase.toUpperCase(), W - margin - 14, 13.5, { align: 'center' });
  }

  y = 46;

  // ── Budget Status section ─────────────────────────────────────────────────
  const sectionHeader = (title, yPos) => {
    doc.setFillColor(240, 243, 248);
    doc.rect(margin, yPos, W - margin * 2, 7, 'F');
    doc.setFillColor(...TEAL);
    doc.rect(margin, yPos, 2.5, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(title, margin + 5, yPos + 4.8);
    return yPos + 11;
  };

  const kpiBox = (label, value, x, yPos, w, color = NAVY) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...LGREY);
    doc.roundedRect(x, yPos, w, 18, 2, 2, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(label.toUpperCase(), x + 4, yPos + 5.5);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(String(value), x + 4, yPos + 14);
  };

  y = sectionHeader('BUDGET STATUS', y);

  // Compute financials
  const originalCV = Number(project.original_contract_value) || 0;
  const approvedCOs = cos.filter(c => c.status === 'Approved');
  const pendingCOs  = cos.filter(c => ['Submitted', 'Under Review'].includes(c.status));
  const approvedCOVal  = approvedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingCOVal   = pendingCOs.reduce((s, c)  => s + (Number(c.co_amount) || 0), 0);
  const revisedCV  = originalCV + approvedCOVal;
  const totalBudget    = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalActual    = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const { ev, ac, cpi } = computeCPI(wps);

  const colW = (W - margin * 2 - 9) / 4;
  kpiBox('Original Contract', fmtCurrency(originalCV), margin, y, colW);
  kpiBox('Revised Contract', fmtCurrency(revisedCV), margin + colW + 3, y, colW, approvedCOVal > 0 ? AMBER : NAVY);
  kpiBox('Actual Cost to Date', fmtCurrency(totalActual), margin + (colW + 3) * 2, y, colW,
    totalBudget > 0 && totalActual > totalBudget ? RED : GREEN);
  kpiBox('CPI', cpi != null ? cpi.toFixed(3) : '—', margin + (colW + 3) * 3, y, colW,
    cpi == null ? GREY : cpi >= 1 ? GREEN : cpi >= 0.9 ? AMBER : RED);

  y += 22;

  // Budget burn bar
  if (totalBudget > 0) {
    const barX = margin;
    const barW = W - margin * 2;
    const barH = 5;
    const pct  = Math.min(1, totalActual / totalBudget);
    setFont(7, 'normal', GREY);
    doc.text(`Cost Code Budget: ${fmtCurrency(totalBudget)}  |  Spent: ${fmtCurrency(totalActual)}  (${fmtPct(totalActual, totalBudget)})`, barX, y + 3);
    y += 6;
    doc.setFillColor(...LGREY);
    doc.roundedRect(barX, y, barW, barH, 1.5, 1.5, 'F');
    const fillColor = totalActual > totalBudget ? RED : totalActual / totalBudget > 0.85 ? AMBER : GREEN;
    doc.setFillColor(...fillColor);
    doc.roundedRect(barX, y, barW * pct, barH, 1.5, 1.5, 'F');
    y += barH + 4;
  }

  // EVM row
  if (ev > 0 || ac > 0) {
    setFont(7, 'normal', GREY);
    const evLabel = `EV: ${fmtCurrency(ev)}  |  AC: ${fmtCurrency(ac)}`;
    const interpretation = cpi != null
      ? (cpi >= 1 ? '✓ Ahead of budget' : cpi >= 0.9 ? '⚠ Slight cost overrun' : '✗ Significant overrun')
      : 'No EVM cost data yet';
    doc.text(`${evLabel}    ${interpretation}`, margin, y + 3);
    y += 8;
  }

  y += 4;

  // ── Change Orders ─────────────────────────────────────────────────────────
  y = sectionHeader(`RECENT CHANGE ORDERS  (${cos.length} total — ${approvedCOs.length} approved, ${pendingCOs.length} pending)`, y);

  if (cos.length === 0) {
    setFont(9, 'normal', GREY); doc.text('No change orders on record.', margin, y); y += 8;
  } else {
    // Table header
    const coHeaders = ['#', 'Title', 'Reason', 'Status', 'Amount', 'Submitted'];
    const coWidths  = [14, 55, 34, 24, 28, 22];
    doc.setFillColor(...NAVY);
    doc.rect(margin, y, W - margin * 2, 6, 'F');
    let cx = margin;
    coHeaders.forEach((h, i) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
      doc.text(h, cx + 2, y + 4.2);
      cx += coWidths[i];
    });
    y += 6;

    // Show last 8 COs sorted by submitted_date desc
    const sortedCOs = [...cos].sort((a, b) => new Date(b.submitted_date || 0) - new Date(a.submitted_date || 0)).slice(0, 8);
    sortedCOs.forEach((co, idx) => {
      const rowBg = idx % 2 === 0 ? WHITE : [247, 249, 252];
      doc.setFillColor(...rowBg);
      doc.rect(margin, y, W - margin * 2, 6, 'F');

      const statusColor = co.status === 'Approved' ? GREEN : co.status === 'Rejected' ? RED : AMBER;
      const cells = [
        co.co_number || `${idx + 1}`,
        (co.title || '').slice(0, 30),
        (co.reason_code || '—').slice(0, 18),
        co.status || '—',
        fmtCurrency(co.co_amount),
        fmtDate(co.submitted_date),
      ];
      cx = margin;
      cells.forEach((cell, i) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', i === 3 ? 'bold' : 'normal');
        doc.setTextColor(...(i === 3 ? statusColor : [50, 60, 80]));
        doc.text(String(cell), cx + 2, y + 4.2);
        cx += coWidths[i];
      });
      y += 6;
    });
    if (cos.length > 8) {
      setFont(7, 'italic', GREY);
      doc.text(`… and ${cos.length - 8} more change orders`, margin, y + 4);
      y += 8;
    }
  }

  y += 6;

  // ── Critical RFIs ─────────────────────────────────────────────────────────
  const criticalRFIs = rfis.filter(r => r.priority === 'Critical' && !['Answered', 'Closed'].includes(r.status));
  y = sectionHeader(`OPEN CRITICAL-SEVERITY RFIs  (${criticalRFIs.length} of ${rfis.filter(r => !['Answered','Closed'].includes(r.status)).length} open)`, y);

  if (criticalRFIs.length === 0) {
    setFont(9, 'normal', GREEN); doc.text('No open critical RFIs. ✓', margin, y); y += 8;
  } else {
    const rfiHeaders = ['RFI #', 'Title', 'Status', 'Submitted', 'Due Date', 'Days Open'];
    const rfiWidths  = [18, 68, 24, 24, 24, 20];
    doc.setFillColor(...RED);
    doc.rect(margin, y, W - margin * 2, 6, 'F');
    let rx = margin;
    rfiHeaders.forEach((h, i) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
      doc.text(h, rx + 2, y + 4.2);
      rx += rfiWidths[i];
    });
    y += 6;

    criticalRFIs.slice(0, 10).forEach((rfi, idx) => {
      const rowBg = idx % 2 === 0 ? WHITE : [255, 248, 248];
      doc.setFillColor(...rowBg);
      doc.rect(margin, y, W - margin * 2, 6, 'F');

      const today = new Date(); today.setHours(0,0,0,0);
      const sub = rfi.submitted_date ? new Date(rfi.submitted_date + 'T00:00:00Z') : null;
      const daysOpen = sub ? Math.floor((today - sub) / 86400000) : '—';
      const isOverdue = rfi.due_date && new Date(rfi.due_date + 'T00:00:00Z') < today;

      const cells = [
        rfi.rfi_number || `${idx + 1}`,
        (rfi.title || '').slice(0, 38),
        rfi.status || '—',
        fmtDate(rfi.submitted_date),
        fmtDate(rfi.due_date),
        String(daysOpen),
      ];
      rx = margin;
      cells.forEach((cell, i) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', (i === 4 && isOverdue) ? 'bold' : 'normal');
        doc.setTextColor(...((i === 4 && isOverdue) ? RED : [50, 60, 80]));
        doc.text(String(cell), rx + 2, y + 4.2);
        rx += rfiWidths[i];
      });
      y += 6;
    });
    if (criticalRFIs.length > 10) {
      setFont(7, 'italic', GREY);
      doc.text(`… and ${criticalRFIs.length - 10} more critical RFIs`, margin, y + 4);
      y += 8;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = 279.4;
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 12, W, 12, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130, 150, 180);
  doc.text('SteelBuild Pro — Confidential Executive Report', margin, pageH - 5);
  doc.text(`Page 1 of 1  ·  ${new Date().toISOString().split('T')[0]}`, W - margin, pageH - 5, { align: 'right' });

  return doc.output('arraybuffer');
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { project_id } = body;

    // Load all data in parallel
    const [projects, wps, cos, rfis, codes] = await Promise.all([
      base44.asServiceRole.entities.Project.list(),
      base44.asServiceRole.entities.WorkPackage.list(),
      base44.asServiceRole.entities.ChangeOrder.list(),
      base44.asServiceRole.entities.RFI.list(),
      base44.asServiceRole.entities.CostCode.list(),
    ]);

    const targetProjects = project_id
      ? projects.filter(p => p.id === project_id)
      : projects;

    if (targetProjects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Single project → return PDF directly
    if (project_id && targetProjects.length === 1) {
      const p = targetProjects[0];
      const pdfBytes = buildPDF(
        p,
        wps.filter(w => w.project_id === p.id),
        cos.filter(c => c.project_id === p.id),
        rfis.filter(r => r.project_id === p.id),
        codes.filter(c => c.project_id === p.id),
      );
      const filename = `executive-summary-${(p.project_number || p.id).replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Multiple projects → generate each, upload, return URLs
    const results = [];
    for (const p of targetProjects) {
      const pdfBytes = buildPDF(
        p,
        wps.filter(w => w.project_id === p.id),
        cos.filter(c => c.project_id === p.id),
        rfis.filter(r => r.project_id === p.id),
        codes.filter(c => c.project_id === p.id),
      );
      // Upload to public storage using a File object (Web API)
      const filename = `executive-summary-${(p.project_number || p.id).replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      const fileObj = new File([pdfBytes], filename, { type: 'application/pdf' });

      const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
      results.push({
        project_id: p.id,
        project_name: p.name,
        project_number: p.project_number || '',
        file_url: uploadRes?.file_url || null,
        generated_at: new Date().toISOString(),
      });
    }

    return Response.json({ generated: results.length, reports: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});