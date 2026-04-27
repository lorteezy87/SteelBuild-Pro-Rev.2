/**
 * DisplayTab — UI customisation surface.
 *
 * Anything that changes how the app LOOKS or FEELS (vs. anything that
 * changes WHAT data appears, which lives on DashboardTab). Every value
 * here also flows into ThemeContext so the visual change happens
 * immediately, before the round-trip to Supabase finishes.
 *
 * Sections:
 *   1. Theme (dark / light)                                    →  ThemeContext.setTheme
 *   2. Accent colour preset                                    →  ThemeContext.setAccent
 *   3. Font size scale (small / normal / large)                →  ThemeContext.setFontScale
 *   4. Accessibility (high-contrast, reduced motion)           →  ThemeContext.setContrast / setMotion
 *   5. Date / time / locale (date format, time format, week
 *      start, units, currency, number format)                  →  saved as prefs only; consumers read on demand
 *   6. Layout density + default view + tooltips toggles, etc.  →  saved as prefs only
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/shared/ThemeContext';

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.12em',
  textTransform: 'uppercase', marginBottom: 12, display: 'block',
};

const selectStyle = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
};

const optionCard = (isSelected) => ({
  padding: '14px', background: isSelected ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
  borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
});

const Toggle = ({ checked, onChange }) => (
  <div onClick={onChange} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start', width: 44, height: 24, background: checked ? 'var(--status-success)' : 'var(--bg-surface-high)', borderRadius: 12, padding: '2px 4px', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
    <div style={{ width: 20, height: 20, background: '#fff', borderRadius: 10 }} />
  </div>
);

const ACCENT_PRESETS = [
  { id: 'gold',  label: 'Gold',  swatch: '#C89B20' },
  { id: 'teal',  label: 'Teal',  swatch: '#0D9488' },
  { id: 'blue',  label: 'Blue',  swatch: '#2563EB' },
  { id: 'amber', label: 'Amber', swatch: '#F59E0B' },
  { id: 'slate', label: 'Slate', swatch: '#64748B' },
];

const FONT_SCALE_PRESETS = [
  { id: 'sm', label: 'Small',  scale: '94%' },
  { id: 'md', label: 'Normal', scale: '100%' },
  { id: 'lg', label: 'Large',  scale: '112%' },
];

export default function DisplayTab({ preferences, onSave, isSaving }) {
  const { theme, accent, fontScale, contrast, motion,
          setTheme, setAccent, setFontScale, setContrast, setMotion,
          applyPreferences } = useTheme();

  const [prefs, setPrefs] = useState(() => buildPrefs(preferences, { theme, accent, fontScale, contrast, motion }));

  // When preferences load from the server, apply them to ThemeContext
  // (so a user signing in on a new device sees their saved look) and
  // sync our local form state.
  useEffect(() => {
    if (!preferences || Object.keys(preferences).length === 0) return;
    applyPreferences(preferences);
    setPrefs(buildPrefs(preferences, { theme, accent, fontScale, contrast, motion }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(preferences)]);

  // Keep local form state in lockstep with ThemeContext so toggling a
  // visual option from elsewhere (e.g. the future top-bar quick-switch)
  // is reflected here too.
  useEffect(() => {
    setPrefs((p) => ({ ...p, theme, accent_color: accent, font_scale: fontScale, contrast_mode: contrast, motion_mode: motion }));
  }, [theme, accent, fontScale, contrast, motion]);

  const handleChange = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    // Apply visual changes locally first so the UI is instant; the
    // mutation in Settings.jsx persists them to the user-prefs row.
    if (key === 'theme')           setTheme(value);
    if (key === 'accent_color')    setAccent(value);
    if (key === 'font_scale')      setFontScale(value);
    if (key === 'contrast_mode')   setContrast(value);
    if (key === 'motion_mode')     setMotion(value);
    onSave({ [key]: value });
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Display
      </h2>

      {/* Theme */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Theme</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[{ id: 'dark', icon: '🌙', label: 'Dark Mode' }, { id: 'light', icon: '☀️', label: 'Light Mode' }].map(t => (
            <div key={t.id} onClick={() => handleChange('theme', t.id)} style={{ ...optionCard(prefs.theme === t.id), padding: '20px 14px' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: prefs.theme === t.id ? 'var(--accent)' : 'var(--text-primary)' }}>{t.label}</div>
              {prefs.theme === t.id && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4 }}>✓ Selected</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Accent Color</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {ACCENT_PRESETS.map((a) => {
            const active = prefs.accent_color === a.id;
            return (
              <div
                key={a.id}
                onClick={() => handleChange('accent_color', a.id)}
                style={{
                  ...optionCard(active),
                  padding: '14px 10px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: a.swatch,
                    boxShadow: active ? `0 0 0 2px ${a.swatch}66, 0 0 0 4px var(--bg-surface)` : 'none',
                  }}
                />
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                  {a.label}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
          Changes the highlight color used across buttons, links, and selected rows. Status colors (green/red/etc.) are unaffected.
        </div>
      </div>

      {/* Font size scale */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Font Size</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {FONT_SCALE_PRESETS.map((s) => {
            const active = prefs.font_scale === s.id;
            return (
              <div key={s.id} onClick={() => handleChange('font_scale', s.id)} style={optionCard(active)}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: s.id === 'sm' ? 11 : s.id === 'lg' ? 16 : 13,
                  fontWeight: 700,
                  color: active ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  {s.scale}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accessibility */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Accessibility</label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>High Contrast</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lifts text and border colors for AAA contrast targets.</div>
          </div>
          <Toggle
            checked={prefs.contrast_mode === 'high'}
            onChange={() => handleChange('contrast_mode', prefs.contrast_mode === 'high' ? 'normal' : 'high')}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Reduce Motion</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disables transitions and animations across the app.</div>
          </div>
          <Toggle
            checked={prefs.motion_mode === 'reduced'}
            onChange={() => handleChange('motion_mode', prefs.motion_mode === 'reduced' ? 'auto' : 'reduced')}
          />
        </div>
      </div>

      {/* Date Format */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Date Format</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map(format => (
            <div key={format} onClick={() => handleChange('date_format', format)} style={optionCard(prefs.date_format === format)}>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: prefs.date_format === format ? 'var(--accent)' : 'var(--text-primary)' }}>{format}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>e.g. {format === 'YYYY-MM-DD' ? '2026-03-21' : format === 'DD/MM/YYYY' ? '21/03/2026' : '03/21/2026'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Format + Week Start + Units */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Locale</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Time Format</label>
            <select value={prefs.time_format} onChange={e => handleChange('time_format', e.target.value)} style={selectStyle}>
              <option value="12h">12-hour (3:45 PM)</option>
              <option value="24h">24-hour (15:45)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Week Starts On</label>
            <select value={prefs.week_start} onChange={e => handleChange('week_start', e.target.value)} style={selectStyle}>
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Units</label>
            <select value={prefs.measurement_units} onChange={e => handleChange('measurement_units', e.target.value)} style={selectStyle}>
              <option value="imperial">Imperial (ft, in, lbs)</option>
              <option value="metric">Metric (m, mm, kg)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Currency & Numbers */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Currency &amp; Numbers</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Currency</label>
            <select value={prefs.currency_format} onChange={e => handleChange('currency_format', e.target.value)} style={selectStyle}>
              {['USD', 'CAD', 'EUR', 'GBP', 'MXN'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Number Format</label>
            <select value={prefs.number_format} onChange={e => handleChange('number_format', e.target.value)} style={selectStyle}>
              <option value="comma">1,234,567 (US)</option>
              <option value="period">1.234.567 (EU)</option>
              <option value="space">1 234 567 (intl)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Density */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Table Density</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { id: 'compact', label: 'Compact', desc: '10px rows' },
            { id: 'normal', label: 'Normal', desc: '12px rows' },
            { id: 'comfortable', label: 'Comfortable', desc: '14px rows' },
          ].map(d => (
            <div key={d.id} onClick={() => handleChange('table_density', d.id)} style={optionCard(prefs.table_density === d.id)}>
              <div style={{ fontSize: 12, fontWeight: 600, color: prefs.table_density === d.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>{d.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{d.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Default View */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Default View</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[{ id: 'table', icon: '📋' }, { id: 'board', icon: '📇' }, { id: 'gantt', icon: '📊' }, { id: 'list', icon: '📝' }].map(v => (
            <div key={v.id} onClick={() => handleChange('default_view', v.id)} style={optionCard(prefs.default_view === v.id)}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{v.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', color: prefs.default_view === v.id ? 'var(--accent)' : 'var(--text-primary)' }}>{v.id}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div>
        <label style={labelStyle}>Additional Options</label>
        {[
          { key: 'compact_mode', label: 'Compact Mode', desc: 'Reduce spacing and padding' },
          { key: 'show_tooltips', label: 'Show Tooltips', desc: 'Display helpful hints on hover' },
          { key: 'show_project_numbers', label: 'Show Project Numbers', desc: 'Display project numbers in lists' },
          { key: 'sidebar_collapsed', label: 'Start Sidebar Collapsed', desc: 'Collapse navigation on load' },
          { key: 'show_keyboard_hints', label: 'Show Keyboard Hints', desc: 'Reveal shortcut overlays in dialogs' },
          { key: 'auto_open_drawers', label: 'Auto-Open Detail Drawers', desc: 'Open the detail panel on row click instead of single-line preview' },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <Toggle checked={!!prefs[item.key]} onChange={() => handleChange(item.key, !prefs[item.key])} />
          </div>
        ))}
      </div>

      {isSaving && <div style={{ marginTop: 16, fontSize: 12, color: 'var(--status-success)', fontFamily: 'var(--font-mono)' }}>✓ Saving...</div>}
    </div>
  );
}

function buildPrefs(p, theme) {
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
