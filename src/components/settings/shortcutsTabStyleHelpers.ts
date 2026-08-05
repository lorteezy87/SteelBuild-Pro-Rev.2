/**
 * Pure chrome styles for ShortcutsTab.
 */

export const SHORTCUTS_HEADER_STYLE: Record<string, string | number> = {
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 6px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export const SHORTCUTS_GROUP_HEADER_STYLE: Record<string, string | number> = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  margin: '24px 0 10px 0',
};

export const SHORTCUTS_ROW_STYLE: Record<string, string | number> = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  gap: 12,
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: '1px solid var(--divider)',
};

export const SHORTCUTS_KBD_STYLE: Record<string, string | number> = {
  display: 'inline-block',
  padding: '2px 7px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  background: 'var(--bg-surface-low)',
  border: '1px solid var(--border-default)',
  borderBottom: '2px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  marginRight: 4,
};
