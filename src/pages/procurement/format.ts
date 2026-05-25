import type { CSSProperties } from "react";

export const PROCUREMENT_CATEGORIES = [
  'Structural Steel — Mill Order',
  'Joists & Deck',
  'Stairs & Ladders',
  'Embeds & Anchor Bolts',
  'Miscellaneous Metals',
  'Galvanizing / Paint / Coating',
  'Long-Lead Item',
  'Hardware & Fasteners',
  'Equipment Rental',
  'Other',
];

export const CAT_COLORS: Record<string, string> = {
  'Structural Steel — Mill Order': 'var(--accent)',
  'Joists & Deck': 'var(--phase-detailing)',
  'Stairs & Ladders': 'var(--accent)',
  'Embeds & Anchor Bolts': 'var(--status-warning)',
  'Miscellaneous Metals': 'var(--status-info)',
  'Galvanizing / Paint / Coating': 'var(--status-warning)',
  'Long-Lead Item': 'var(--status-error)',
  'Hardware & Fasteners': 'var(--text-secondary)',
  'Equipment Rental': 'var(--phase-erection)',
  'Other': 'var(--text-muted)',
};

// Pipeline order - Cancelled is intentionally excluded from the kanban.
export const PIPELINE_STATUSES = [
  { id: 'Identified',     label: 'Identified',    short: 'IDENT',     color: 'var(--text-muted)' },
  { id: 'Quoted',         label: 'Quoted',        short: 'QUOTED',    color: 'var(--status-info)' },
  { id: 'PO Issued',      label: 'PO Issued',     short: 'PO',        color: 'var(--accent)' },
  { id: 'Confirmed',      label: 'Confirmed',     short: 'CONFIRM',   color: 'var(--phase-detailing)' },
  { id: 'In Production',  label: 'In Production', short: 'IN PROD',   color: 'var(--status-warning)' },
  { id: 'Shipped',        label: 'Shipped',       short: 'SHIPPED',   color: 'var(--phase-delivery)' },
  { id: 'Received',       label: 'Received',      short: 'RECEIVED',  color: 'var(--status-success)' },
];

export const ALL_STATUSES = [...PIPELINE_STATUSES.map(s => s.id), 'Cancelled'];

export const iStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--text-muted)',
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 4,
};

export const sectionLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  gridColumn: 'span 2',
  borderBottom: '1px solid var(--divider)',
  paddingBottom: 4,
  marginTop: 6,
};

/** Days difference; null when either side is missing/invalid. */
export function daysBetween(a: unknown, b: unknown): number | null {
  if (!a || !b) return null;
  const da = new Date(a as string);
  const db = new Date(b as string);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((+db - +da) / 86400000);
}

/** Add `weeks * 7` days to an ISO date and return YYYY-MM-DD. */
export function addWeeks(isoDate: unknown, weeks: any): string | null {
  if (!isoDate || !Number.isFinite(Number(weeks))) return null;
  const d = new Date(isoDate as string);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d.toISOString().slice(0, 10);
}

export const fmtDate = (d: unknown): string =>
  d ? new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
