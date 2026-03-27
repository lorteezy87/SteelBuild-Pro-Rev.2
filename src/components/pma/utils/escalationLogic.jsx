export const getEscalationLevel = (item, risks = []) => {
  if (!item) return 'MONITOR';
  
  const today = new Date();
  const due = item.due_date ? new Date(item.due_date) : null;
  const daysOverdue = due ? Math.floor((today - due) / 86400000) : 0;
  
  const linkedRisk = risks?.find(r =>
    r.linkedRecords?.includes(item.id)
  );
  const riskScore = linkedRisk?.score || 0;

  if (daysOverdue > 7 || riskScore >= 17)
    return 'ESCALATE';
  if (daysOverdue > 3 || riskScore >= 10)
    return 'RISK';
  if (daysOverdue > 0 || riskScore >= 5)
    return 'REMINDER';
  return 'MONITOR';
};

export const getEscalationStyle = (level) => {
  const styles = {
    ESCALATE: {
      label: '⚡ ESCALATE',
      color: 'var(--status-error)',
      bg: 'var(--danger-muted)',
      border: '1px solid var(--danger-border)',
      pulse: true,
    },
    RISK: {
      label: '⚠ RISK',
      color: 'var(--status-warning)',
      bg: 'var(--warning-muted)',
      border: '1px solid var(--warning-border)',
      pulse: false,
    },
    REMINDER: {
      label: '● REMINDER',
      color: 'var(--status-warning)',
      bg: 'var(--warning-muted)',
      border: '1px solid var(--warning-border)',
      pulse: false,
    },
    MONITOR: {
      label: null,
      color: 'var(--text-muted)',
      bg: 'transparent',
      border: 'none',
      pulse: false,
    },
  };
  return styles[level] || styles.MONITOR;
};

export const countEscalations = (items, risks = []) => {
  return items?.filter(item => {
    const level = getEscalationLevel(item, risks);
    return level === 'ESCALATE' || level === 'RISK';
  }).length || 0;
};
