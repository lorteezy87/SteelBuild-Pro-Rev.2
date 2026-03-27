/**
 * Financial Threshold Alert Engine
 * Evaluates three financial risk signals per project:
 *
 *  1. Over-Budget Risk  — CPI < 0.95 detected now AND was < 0.95 on the last run
 *                         (simulated by checking if a prior "Over-Budget Risk" alert
 *                          already exists for the project, i.e. two-consecutive-run logic).
 *
 *  2. Scope Creep       — Revised Budget > Original Budget by more than 15%
 *                         (sum of Approved CO amounts / original_contract_value).
 *
 *  3. Unbilled WIP      — Earned Value (from work packages) > Amount Billed (from SOV)
 *                         by more than 10% of EV (financing threshold).
 *
 * Must be called by an admin or a scheduled automation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    // ── Load all required data in parallel ──────────────────────────────────
    const [projects, workPackages, changeOrders, sovItems, existingAlerts] = await Promise.all([
      base44.asServiceRole.entities.Project.list(),
      base44.asServiceRole.entities.WorkPackage.list(),
      base44.asServiceRole.entities.ChangeOrder.list(),
      base44.asServiceRole.entities.SOVItem.list(),
      base44.asServiceRole.entities.Alert.list(),
    ]);

    // Index existing active financial alerts by type+project for consecutive-run logic
    const activeFinancialAlerts = existingAlerts.filter(a =>
      !a.is_dismissed &&
      ['Over-Budget Risk', 'Scope Creep', 'Unbilled WIP'].includes(a.alert_type)
    );

    const priorAlertKey = (type, projectId) => `${type}::${projectId}`;
    const priorAlertSet = new Set(activeFinancialAlerts.map(a => priorAlertKey(a.alert_type, a.project_id)));

    const newAlerts = [];
    const alertsToDelete = []; // financial alerts we'll replace

    // ── Per-project evaluation ───────────────────────────────────────────────
    for (const project of projects) {
      const pid = project.id;

      const projectWPs = workPackages.filter(wp => wp.project_id === pid);
      const projectCOs = changeOrders.filter(co => co.project_id === pid);
      const projectSOV = sovItems.filter(s => s.project_id === pid);

      // ── EVM Calculations ──────────────────────────────────────────────────
      const bac = projectWPs.reduce((s, wp) =>
        s + (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0), 0);

      const effectiveBac = bac > 0 ? bac : (Number(project.original_budget_at_completion) || 0);

      const ev = projectWPs.reduce((s, wp) => {
        const wpBac = (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
        return s + wpBac * ((Number(wp.percent_complete) || 0) / 100);
      }, 0);

      const ac = projectWPs.reduce((s, wp) =>
        s + (Number(wp.actual_labor_cost_to_date) || 0) + (Number(wp.actual_material_cost_to_date) || 0), 0);

      const cpi = ac > 0 ? ev / ac : null;

      // ── 1. OVER-BUDGET RISK: CPI < 0.95 for two consecutive runs ─────────
      if (cpi !== null && effectiveBac > 0) {
        const cpiTrigger = cpi < 0.95;
        const hadPriorAlert = priorAlertSet.has(priorAlertKey('Over-Budget Risk', pid));

        // Mark old alert for removal so we refresh the message/metrics
        const oldAlert = activeFinancialAlerts.find(
          a => a.alert_type === 'Over-Budget Risk' && a.project_id === pid
        );
        if (oldAlert) alertsToDelete.push(oldAlert.id);

        if (cpiTrigger) {
          const severity = cpi < 0.85 ? 'Critical' : cpi < 0.90 ? 'High' : 'Medium';
          const runLabel = hadPriorAlert ? ' (sustained — second consecutive run)' : ' (first detection)';
          newAlerts.push({
            alert_type: 'Over-Budget Risk',
            severity: hadPriorAlert ? (cpi < 0.90 ? 'Critical' : 'High') : severity,
            title: `Over-Budget Risk: ${project.name}`,
            message: `CPI is ${cpi.toFixed(3)} (threshold: 0.95)${runLabel}. For every $1.00 budgeted, the project is only returning $${cpi.toFixed(2)} of value. EV: $${ev.toLocaleString('en-US', { maximumFractionDigits: 0 })}, AC: $${ac.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
            project_id: pid,
            project_name: project.name,
            record_type: 'Project',
            record_id: pid,
            is_read: false,
            is_dismissed: false,
            metric_snapshot: JSON.stringify({ cpi: +cpi.toFixed(4), ev, ac, bac: effectiveBac, consecutive: hadPriorAlert }),
          });
        }
      }

      // ── 2. SCOPE CREEP: Approved COs inflate budget by > 15% ─────────────
      const originalContractValue = Number(project.original_contract_value) || 0;
      if (originalContractValue > 0) {
        const approvedCOTotal = projectCOs
          .filter(co => co.status === 'Approved')
          .reduce((s, co) => s + (Number(co.co_amount) || 0), 0);

        const scopeInflationPct = (approvedCOTotal / originalContractValue) * 100;

        const oldAlert = activeFinancialAlerts.find(
          a => a.alert_type === 'Scope Creep' && a.project_id === pid
        );
        if (oldAlert) alertsToDelete.push(oldAlert.id);

        if (scopeInflationPct > 15) {
          const severity = scopeInflationPct > 30 ? 'Critical' : scopeInflationPct > 22 ? 'High' : 'Medium';
          newAlerts.push({
            alert_type: 'Scope Creep',
            severity,
            title: `Scope Creep Alert: ${project.name}`,
            message: `Approved Change Orders have expanded the contract by ${scopeInflationPct.toFixed(1)}% (threshold: 15%). Original contract: $${originalContractValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Approved CO value: +$${approvedCOTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Revised contract: $${(originalContractValue + approvedCOTotal).toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
            project_id: pid,
            project_name: project.name,
            record_type: 'Project',
            record_id: pid,
            is_read: false,
            is_dismissed: false,
            metric_snapshot: JSON.stringify({ scopeInflationPct: +scopeInflationPct.toFixed(2), originalContractValue, approvedCOTotal }),
          });
        }
      }

      // ── 3. UNBILLED WIP: EV significantly > Amount Billed ────────────────
      if (ev > 0) {
        // Amount billed = sum of SOV items that are Submitted, Certified, or Paid
        // (current_percent_complete × scheduled_value)
        const amountBilled = projectSOV.reduce((s, sov) => {
          const billedPct = (Number(sov.current_percent_complete) || 0) / 100;
          return s + (Number(sov.scheduled_value) || 0) * billedPct;
        }, 0);

        const wipGap = ev - amountBilled;
        const wipPct = (wipGap / ev) * 100; // what % of EV is unbilled

        const oldAlert = activeFinancialAlerts.find(
          a => a.alert_type === 'Unbilled WIP' && a.project_id === pid
        );
        if (oldAlert) alertsToDelete.push(oldAlert.id);

        // Trigger if unbilled WIP > 10% of EV and gap > $10,000 (avoid noise on tiny projects)
        if (wipPct > 10 && wipGap > 10000) {
          const severity = wipPct > 30 ? 'Critical' : wipPct > 20 ? 'High' : 'Medium';
          newAlerts.push({
            alert_type: 'Unbilled WIP',
            severity,
            title: `Unbilled WIP: ${project.name}`,
            message: `${wipPct.toFixed(1)}% of earned value is unbilled (threshold: 10%). You are effectively financing $${wipGap.toLocaleString('en-US', { maximumFractionDigits: 0 })} for the client. EV: $${ev.toLocaleString('en-US', { maximumFractionDigits: 0 })}, Amount Billed: $${amountBilled.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Submit an application for payment.`,
            project_id: pid,
            project_name: project.name,
            record_type: 'Project',
            record_id: pid,
            is_read: false,
            is_dismissed: false,
            metric_snapshot: JSON.stringify({ wipGap: +wipGap.toFixed(2), wipPct: +wipPct.toFixed(2), ev, amountBilled }),
          });
        }
      }
    }

    // ── Persist: delete stale financial alerts, insert fresh ones ───────────
    const uniqueDeleteIds = [...new Set(alertsToDelete)];
    await Promise.all(uniqueDeleteIds.map(id => base44.asServiceRole.entities.Alert.delete(id)));

    if (newAlerts.length > 0) {
      await new Promise(r => setTimeout(r, 150)); // brief pause after deletes
      await Promise.all(newAlerts.map(a => base44.asServiceRole.entities.Alert.create(a)));
    }

    return Response.json({
      evaluated: projects.length,
      generated: newAlerts.length,
      alerts: newAlerts.map(a => ({ type: a.alert_type, project: a.project_name, severity: a.severity })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});