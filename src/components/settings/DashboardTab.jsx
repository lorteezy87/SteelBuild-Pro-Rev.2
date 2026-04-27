import React, { useState, useEffect } from 'react';
import { Pin, GripVertical, Eye, EyeOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

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

const Toggle = ({ checked, onChange }) => (
  <div onClick={onChange} style={{
    display: 'inline-flex', alignItems: 'center',
    justifyContent: checked ? 'flex-end' : 'flex-start',
    width: 40, height: 22, background: checked ? 'var(--success)' : 'var(--bg-surface-high)',
    borderRadius: 11, padding: '2px 3px', cursor: 'pointer',
    transition: 'all 0.2s', flexShrink: 0,
  }}>
    <div style={{ width: 18, height: 18, background: 'var(--on-accent)', borderRadius: 9 }} />
  </div>
);

// Available KPIs on the main dashboard
const AVAILABLE_KPIS = [
  { id: 'open_rfis',        label: 'Open RFIs' },
  { id: 'pending_cos',      label: 'Pending Change Orders' },
  { id: 'contract_value',   label: 'Contract Value' },
  { id: 'labor_burn',       label: 'Labor Burn' },
  { id: 'work_packages',    label: 'Work Packages' },
  { id: 'critical_alerts',  label: 'Critical Alerts' },
  { id: 'deliveries',       label: 'Upcoming Deliveries' },
  { id: 'tons_produced',    label: 'Tons Produced' },
];

// Pinnable navigation modules
const AVAILABLE_MODULES = [
  { id: 'Projects',      label: 'Projects' },
  { id: 'Vendors',       label: 'Vendors' },
  { id: 'Drawings',      label: 'Drawings' },
  { id: 'RFIs',          label: 'RFIs' },
  { id: 'ChangeOrders',  label: 'Change Orders' },
  { id: 'Submittals',    label: 'Submittals' },
  { id: 'Deliveries',    label: 'Deliveries' },
  { id: 'DailyLogs',     label: 'Daily Logs' },
  { id: 'Inspections',   label: 'Inspections' },
  { id: 'WorkPackages',  label: 'Work Packages' },
];

const LANDING_PAGES = [
  'Dashboard', 'Projects', 'RFIs', 'Drawings',
  'DailyLogs', 'Deliveries', 'ChangeOrders', 'JobStatusReport',
];

export default function DashboardTab({ preferences, onSave, isSaving }) {
  // Pull the project list once so the "Default project" dropdown
  // reflects what's actually available. Cached for 5 min — same
  // staleTime the rest of the app uses for the project list.
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-settings'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const [prefs, setPrefs] = useState({
    default_landing:    preferences?.default_landing || 'Dashboard',
    default_project_id: preferences?.default_project_id || '',
    auto_refresh_secs:  preferences?.auto_refresh_secs ?? 0,
    pinned_modules:     preferences?.pinned_modules || ['Projects', 'RFIs', 'Drawings'],
    visible_kpis:       preferences?.visible_kpis || AVAILABLE_KPIS.map(k => k.id),
    kpi_order:          preferences?.kpi_order || AVAILABLE_KPIS.map(k => k.id),
    dashboard_density:  preferences?.dashboard_density || 'normal',
    show_welcome:       preferences?.show_welcome !== false,
  });

  useEffect(() => {
    if (!preferences || Object.keys(preferences).length === 0) return;
    setPrefs({
      default_landing:    preferences.default_landing || 'Dashboard',
      default_project_id: preferences.default_project_id || '',
      auto_refresh_secs:  preferences.auto_refresh_secs ?? 0,
      pinned_modules:     preferences.pinned_modules || ['Projects', 'RFIs', 'Drawings'],
      visible_kpis:       preferences.visible_kpis || AVAILABLE_KPIS.map(k => k.id),
      kpi_order:          preferences.kpi_order || AVAILABLE_KPIS.map(k => k.id),
      dashboard_density:  preferences.dashboard_density || 'normal',
      show_welcome:       preferences.show_welcome !== false,
    });
  }, [JSON.stringify(preferences)]);

  const handleChange = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    onSave(updated);
  };

  const togglePinned = (moduleId) => {
    const next = prefs.pinned_modules.includes(moduleId)
      ? prefs.pinned_modules.filter(m => m !== moduleId)
      : [...prefs.pinned_modules, moduleId];
    handleChange('pinned_modules', next);
  };

  const toggleKpiVisible = (kpiId) => {
    const next = prefs.visible_kpis.includes(kpiId)
      ? prefs.visible_kpis.filter(k => k !== kpiId)
      : [...prefs.visible_kpis, kpiId];
    handleChange('visible_kpis', next);
  };

  const moveKpi = (kpiId, direction) => {
    const idx = prefs.kpi_order.indexOf(kpiId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= prefs.kpi_order.length) return;
    const next = [...prefs.kpi_order];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    handleChange('kpi_order', next);
  };

  // Sort KPIs by current order for display
  const orderedKpis = [...prefs.kpi_order]
    .map(id => AVAILABLE_KPIS.find(k => k.id === id))
    .filter(Boolean);
  // Append any KPIs not yet in order (defensive)
  AVAILABLE_KPIS.forEach(k => {
    if (!orderedKpis.find(o => o.id === k.id)) orderedKpis.push(k);
  });

  return (
    <div>
      <h2 style={{
        fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
        color: 'var(--text-primary)', margin: '0 0 6px 0',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Dashboard
      </h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', margin: '0 0 24px 0' }}>
        Personalize your landing page, pinned modules, and which KPIs appear first.
      </p>

      {/* Default landing page */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Default Landing Page</label>
        <select
          value={prefs.default_landing}
          onChange={e => handleChange('default_landing', e.target.value)}
          style={selectStyle}
        >
          {LANDING_PAGES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
          This is the page you'll see when you open SteelBuild Pro each morning.
        </div>
      </div>

      {/* Default project on load */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Default Project</label>
        <select
          value={prefs.default_project_id || ''}
          onChange={e => handleChange('default_project_id', e.target.value)}
          style={selectStyle}
        >
          <option value="">— None (open in Portfolio view) —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_number ? `${p.project_number} · ` : ''}{p.name || 'Untitled'}
            </option>
          ))}
        </select>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
          Auto-select this project on every page that has a project switcher. Leave blank to default to the portfolio.
        </div>
      </div>

      {/* Auto-refresh interval */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Auto-Refresh Live Data</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[
            { value: 0,    label: 'Off' },
            { value: 30,   label: '30s' },
            { value: 60,   label: '1 min' },
            { value: 300,  label: '5 min' },
            { value: 900,  label: '15 min' },
          ].map((r) => {
            const active = (prefs.auto_refresh_secs ?? 0) === r.value;
            return (
              <div
                key={r.value}
                onClick={() => handleChange('auto_refresh_secs', r.value)}
                style={{
                  padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                  background: active ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
                  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {r.label}
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
          When set, the dashboard quietly refetches RFIs, deliveries, and the activity feed at this cadence so what you see on screen stays current.
        </div>
      </div>

      {/* Pinned modules */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Pinned Modules</label>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
          Pinned modules appear at the top of your sidebar for quick access.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {AVAILABLE_MODULES.map(m => {
            const pinned = prefs.pinned_modules.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => togglePinned(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  background: pinned ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
                  border: `1px solid ${pinned ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
              >
                <Pin
                  size={11}
                  color={pinned ? 'var(--accent)' : 'var(--text-muted)'}
                  fill={pinned ? 'var(--accent)' : 'none'}
                />
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  color: pinned ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI visibility + order */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>KPI Cards on Dashboard</label>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
          Show, hide, and reorder the KPI cards on your main dashboard.
        </div>
        <div style={{
          background: 'var(--bg-surface-low)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {orderedKpis.map((kpi, idx) => {
            const visible = prefs.visible_kpis.includes(kpi.id);
            return (
              <div key={kpi.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                borderBottom: idx < orderedKpis.length - 1 ? '1px solid var(--divider)' : 'none',
                background: visible ? 'transparent' : 'var(--bg-surface-lowest)',
                opacity: visible ? 1 : 0.6,
              }}>
                <GripVertical size={12} color="var(--text-muted)" />
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--text-muted)', minWidth: 20,
                }}>
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-primary)' }}>
                  {kpi.label}
                </div>
                <button
                  onClick={() => moveKpi(kpi.id, 'up')}
                  disabled={idx === 0}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-default)',
                    borderRadius: 4, padding: '2px 7px', cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 9,
                    opacity: idx === 0 ? 0.4 : 1,
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveKpi(kpi.id, 'down')}
                  disabled={idx === orderedKpis.length - 1}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-default)',
                    borderRadius: 4, padding: '2px 7px',
                    cursor: idx === orderedKpis.length - 1 ? 'not-allowed' : 'pointer',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 9,
                    opacity: idx === orderedKpis.length - 1 ? 0.4 : 1,
                  }}
                >
                  ↓
                </button>
                <button
                  onClick={() => toggleKpiVisible(kpi.id)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: visible ? 'var(--accent)' : 'var(--text-muted)',
                    padding: 4, display: 'flex', alignItems: 'center',
                  }}
                  title={visible ? 'Hide' : 'Show'}
                >
                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dashboard density */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Dashboard Density</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { id: 'compact',     label: 'Compact',     desc: 'More cards per row' },
            { id: 'normal',      label: 'Normal',      desc: 'Default spacing' },
            { id: 'comfortable', label: 'Comfortable', desc: 'Spacious layout' },
          ].map(d => {
            const active = prefs.dashboard_density === d.id;
            return (
              <div
                key={d.id}
                onClick={() => handleChange('dashboard_density', d.id)}
                style={{
                  padding: '12px 14px', textAlign: 'center', cursor: 'pointer',
                  background: active ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
                  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  borderRadius: 6, transition: 'all 0.15s',
                }}
              >
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                  {d.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                  {d.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Welcome banner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 0', borderTop: '1px solid var(--divider)',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            Show welcome banner
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)' }}>
            Display the greeting + activity summary at the top of the dashboard.
          </div>
        </div>
        <Toggle checked={prefs.show_welcome} onChange={() => handleChange('show_welcome', !prefs.show_welcome)} />
      </div>

      {isSaving && (
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
          ✓ Saving…
        </div>
      )}
    </div>
  );
}
