/**
 * Project Health Score Calculation
 * Weighted KPI-based scoring (0-100)
 * All factors default to 100 (healthy) when data is missing.
 */

export async function calculateProjectHealthScore(projectId, base44) {
  if (!projectId) return 0;
  try {
    // Load all data in parallel
    const [rfis, changeOrders, deliveries, actionItems, costCodes, tasks, dailyLogs] =
      await Promise.all([
        base44.entities.RFI.filter({ project_id: projectId }).catch(() => []),
        base44.entities.ChangeOrder.filter({ project_id: projectId }).catch(() => []),
        base44.entities.Delivery.filter({ project_id: projectId }).catch(() => []),
        base44.entities.ActionItem.filter({ project_id: projectId }).catch(() => []),
        base44.entities.CostCode.filter({ project_id: projectId }).catch(() => []),
        base44.entities.ScheduleTask.filter({ project_id: projectId }).catch(() => []),
        base44.entities.DailyLog.filter({ project_id: projectId }).catch(() => []),
      ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Factor 1: RFI health (30 points) ──
    const openRFIs = rfis.filter(r => r.status !== "Closed");
    const overdueRFIs = openRFIs.filter(r => r.due_date && new Date(r.due_date + "T00:00:00Z") < today);
    const criticalOverdue = overdueRFIs.filter(r => r.priority === "Critical");
    let rfiScore = 100;
    if (criticalOverdue.length > 0) rfiScore = 0;
    else if (openRFIs.length > 0)
      rfiScore = Math.max(0, 100 - (overdueRFIs.length / openRFIs.length) * 100);

    // ── Factor 2: Budget health (25 points) ──
    const totalBudget = costCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const totalSpend = costCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0) + (Number(c.committed_cost) || 0), 0);
    let budgetScore = 100;
    if (totalBudget > 0) {
      const variance = (totalSpend - totalBudget) / totalBudget;
      if (variance < 0.02) budgetScore = 100;
      else if (variance < 0.05) budgetScore = 80;
      else if (variance < 0.10) budgetScore = 60;
      else if (variance < 0.20) budgetScore = 30;
      else budgetScore = 0;
    }

    // ── Factor 3: Action items (20 points) ──
    const openAI = (actionItems || []).filter(a => a.status !== "Complete");
    const overdueAI = openAI.filter(a => a.due_date && new Date(a.due_date + "T00:00:00Z") < today);
    let aiScore = 100;
    if (openAI.length > 0)
      aiScore = Math.max(0, 100 - (overdueAI.length / openAI.length) * 80);

    // ── Factor 4: Delivery performance (15 points) ──
    const scheduledDel = deliveries.filter(d => d.scheduled_date);
    const lateDel = scheduledDel.filter(d => d.status !== "Delivered" && new Date(d.scheduled_date + "T00:00:00Z") < today);
    let delScore = 100;
    if (scheduledDel.length > 0)
      delScore = Math.max(0, 100 - (lateDel.length / scheduledDel.length) * 100);

    // ── Factor 5: Safety (10 points) ──
    const totalIncidents = dailyLogs.reduce((s, l) => s + (Number(l.safety_incidents) || 0), 0);
    const safetyScore = totalIncidents > 0 ? 0 : 100;

    // Weighted average
    const score = Math.round(
      rfiScore    * 0.30 +
      budgetScore * 0.25 +
      aiScore     * 0.20 +
      delScore    * 0.15 +
      safetyScore * 0.10
    );

    return Math.min(100, Math.max(0, score));
  } catch (error) {
    console.error("Error calculating health score:", error);
    return 0;
  }
}

export function getHealthLabel(score) {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WATCH";
  if (score >= 40) return "AT RISK";
  return "CRITICAL";
}

export function getHealthColor(score) {
  if (score >= 80) return "var(--status-success)";
  if (score >= 60) return "var(--status-warning)";
  if (score >= 40) return "var(--status-warning)";
  return "var(--status-error)";
}