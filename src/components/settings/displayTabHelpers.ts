/** Pure preference defaults merge for DisplayTab. */

export function buildPrefs(p, theme) {
  const safe = p && typeof p === 'object' ? p : {};
  return {
    theme:                 safe.theme         || theme.theme         || 'dark',
    accent_color:          safe.accent_color  || theme.accent        || 'gold',
    font_scale:            safe.font_scale    || theme.fontScale     || 'md',
    contrast_mode:         safe.contrast_mode || theme.contrast      || 'normal',
    motion_mode:           safe.motion_mode   || theme.motion        || 'auto',
    default_view:          safe.default_view          || 'table',
    compact_mode:          !!safe.compact_mode,
    show_tooltips:         safe.show_tooltips !== false,
    date_format:           safe.date_format          || 'MM/DD/YYYY',
    time_format:           safe.time_format          || '12h',
    week_start:            safe.week_start           || 'sunday',
    measurement_units:     safe.measurement_units    || 'imperial',
    currency_format:       safe.currency_format      || 'USD',
    number_format:         safe.number_format        || 'comma',
    default_landing:       safe.default_landing      || 'Dashboard',
    table_density:         safe.table_density        || 'normal',
    show_project_numbers:  safe.show_project_numbers !== false,
    sidebar_collapsed:     !!safe.sidebar_collapsed,
    show_keyboard_hints:   safe.show_keyboard_hints !== false,
    auto_open_drawers:     safe.auto_open_drawers !== false,
  };
}

export const labelStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 12,
  display: "block",
};

export const selectStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export function optionCard(isSelected: boolean): Record<string, string | number> {
  return {
    padding: "14px",
    background: isSelected ? "var(--accent-muted)" : "var(--bg-surface-low)",
    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-default)"}`,
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.15s",
    textAlign: "center",
  };
}
