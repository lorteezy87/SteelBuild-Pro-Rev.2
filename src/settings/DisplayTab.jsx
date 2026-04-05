import React, { useState, useEffect } from 'react';

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

export default function DisplayTab({ preferences, onSave, isSaving }) {
  const [prefs, setPrefs] = useState({
    theme: preferences?.theme || 'dark',
    default_view: preferences?.default_view || 'table',
    compact_mode: preferences?.compact_mode || false,
    show_tooltips: preferences?.show_tooltips !== false,
    date_format: preferences?.date_format || 'MM/DD/YYYY',
    currency_format: preferences?.currency_format || 'USD',
    number_format: preferences?.number_format || 'comma',
    default_landing: preferences?.default_landing || 'Dashboard',
    table_density: preferences?.table_density || 'normal',
    show_project_numbers: preferences?.show_project_numbers !== false,
    sidebar_collapsed: preferences?.sidebar_collapsed || false,
  });

  useEffect(() => {
    if (!preferences || Object.keys(preferences).length === 0) return;
    setPrefs({
      theme: preferences.theme || 'dark',
      default_view: preferences.default_view || 'table',
      compact_mode: preferences.compact_mode || false,
      show_tooltips: preferences.show_tooltips !== false,
      date_format: preferences.date_format || 'MM/DD/YYYY',
      currency_format: preferences.currency_format || 'USD',
      number_format: preferences.number_format || 'comma',
      default_landing: preferences.default_landing || 'Dashboard',
      table_density: preferences.table_density || 'normal',
      show_project_numbers: preferences.show_project_numbers !== false,
      sidebar_collapsed: preferences.sidebar_collapsed || false,
    });
  }, [JSON.stringify(preferences)]);

  const handleChange = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    onSave(updated);
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

      {/* Currency & Numbers */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Currency & Numbers</label>
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