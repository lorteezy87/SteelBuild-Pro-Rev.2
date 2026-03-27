export const detectDrift = (snapshot) => {
  if (!snapshot) return [];
  const driftItems = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Schedule drift
  const lateTasks = snapshot.schedule?.filter(t =>
    new Date(t.end_date) < today && t.status !== 'Complete'
  ) || [];
  if (lateTasks.length > 0) {
    driftItems.push({
      dimension: 'Schedule',
      severity: lateTasks.length > 3 ? 'Critical' : 'High',
      detail: `${lateTasks.length} tasks behind schedule`,
      items: lateTasks.slice(0, 3).map(t => t.task_name),
    });
  }

  // 2. Procurement drift
  const lateDeliveries = snapshot.deliveries?.records?.filter(d =>
    new Date(d.scheduled_date) < today && d.status !== 'Delivered'
  ) || [];
  if (lateDeliveries.length > 0) {
    driftItems.push({
      dimension: 'Procurement',
      severity: 'High',
      detail: `${lateDeliveries.length} late deliveries`,
      items: lateDeliveries.slice(0, 3).map(d => d.description || 'DEL-' + d.delivery_id),
    });
  }

  // 3. Cost drift
  const budget = Number(snapshot.project?.contractValue) || 0;
  const committed = snapshot.budget?.committed || 0;
  const costPct = budget > 0 ? Math.round(committed / budget * 100) : 0;
  if (costPct > 85) {
    driftItems.push({
      dimension: 'Cost',
      severity: costPct > 100 ? 'Critical' : 'High',
      detail: `${costPct}% of budget committed`,
      items: [],
    });
  }

  // 4. Drawing drift
  const staleDrawings = snapshot.drawings?.filter(d =>
    d.stage === 'In Progress' &&
    d.updated_date &&
    (today - new Date(d.updated_date)) / 86400000 > 14
  ) || [];
  if (staleDrawings.length > 0) {
    driftItems.push({
      dimension: 'Drawing',
      severity: 'Medium',
      detail: `${staleDrawings.length} drawings unchanged 14+ days`,
      items: staleDrawings.slice(0, 3).map(d => d.sheet_number),
    });
  }

  // 5. Submittal drift
  const overdueSubmittals = snapshot.submittals?.records?.filter(s =>
    new Date(s.due_date) < today && !['Approved', 'Void'].includes(s.status)
  ) || [];
  if (overdueSubmittals.length > 0) {
    driftItems.push({
      dimension: 'Submittal',
      severity: overdueSubmittals.length > 2 ? 'High' : 'Medium',
      detail: `${overdueSubmittals.length} overdue`,
      items: overdueSubmittals.slice(0, 3).map(s => s.sheet_number),
    });
  }

  // 6. RFI drift
  const overdueRFIs = snapshot.rfis?.records?.filter(r =>
    new Date(r.due_date) < today && r.status !== 'Closed'
  ) || [];
  if (overdueRFIs.length > 0) {
    driftItems.push({
      dimension: 'RFI',
      severity: overdueRFIs.length > 3 ? 'High' : 'Medium',
      detail: `${overdueRFIs.length} unanswered past due`,
      items: overdueRFIs.slice(0, 3).map(r => r.rfi_number),
    });
  }

  return driftItems.sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return order[a.severity] - order[b.severity];
  });
};

export const severityColor = (severity) => {
  const colors = {
    Critical: 'var(--status-error)',
    High: 'var(--status-warning)',
    Medium: 'var(--status-warning)',
    Low: 'var(--text-muted)',
  };
  return colors[severity] || colors.Low;
};

export const severityBg = (severity) => {
  const bgs = {
    Critical: 'var(--danger-muted)',
    High: 'var(--warning-muted)',
    Medium: 'rgba(255,255,255,0.03)',
    Low: 'rgba(255,255,255,0.02)',
  };
  return bgs[severity] || bgs.Low;
};