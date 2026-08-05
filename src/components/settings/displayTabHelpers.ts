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