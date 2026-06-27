export const pendingItemStyle = {
  color: "var(--status-error)",
  fontWeight: 700,
  fontFamily: 'var(--font-body)',
};

export const deliveredItemStyle = {
  color: "var(--status-success)",
  fontWeight: 400,
  fontFamily: 'var(--font-body)',
  opacity: 0.65,
};

export const isPending = (status) => status !== 'Delivered';

export const getItemStyle = (status) =>
  isPending(status) ? pendingItemStyle : deliveredItemStyle;

export const statusBadgeStyles = {
  Pending: {
    background: "var(--danger-muted)",
    color: "var(--status-error)",
    border: "1px solid var(--danger-border)",
  },
  Ordered: {
    background: "var(--warning-muted)",
    color: "var(--status-warning)",
    border: "1px solid var(--warning-border)",
  },
  Fabricating: {
    background: "var(--accent-muted)",
    color: "var(--accent)",
    border: "1px solid var(--accent-border)",
  },
  Delivered: {
    background: "var(--success-muted)",
    color: "var(--status-success)",
    border: "1px solid var(--success-border)",
  },
};

export const badgeBaseStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '8px',
  letterSpacing: '0.10em',
  padding: '2px 8px',
  borderRadius: '4px',
  display: 'inline-block',
  textTransform: 'uppercase',
};

export const getStatusBadgeStyle = (status) => ({
  ...badgeBaseStyle,
  ...(statusBadgeStyles[status] || statusBadgeStyles.Pending),
});

export const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
};