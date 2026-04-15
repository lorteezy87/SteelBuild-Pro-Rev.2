import React, { useState, useEffect } from 'react';

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.12em',
  textTransform: 'uppercase', marginBottom: 12, display: 'block',
};

const inputStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none',
};

const Toggle = ({ checked, onChange }) => (
  <div onClick={onChange} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start', width: 44, height: 24, background: checked ? 'var(--status-success)' : 'var(--bg-surface-high)', borderRadius: 12, padding: '2px 4px', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
    <div style={{ width: 20, height: 20, background: '#fff', borderRadius: 10 }} />
  </div>
);

const notifications = [
  { key: 'notify_rfi_updates', label: 'RFI Updates', desc: 'Created, updated, answered', category: 'Project Activity' },
  { key: 'notify_rfi_overdue', label: 'RFI Overdue', desc: 'When RFI passes due date', category: 'Project Activity', urgent: true },
  { key: 'notify_co_changes', label: 'Change Orders', desc: 'Submitted or approved', category: 'Project Activity' },
  { key: 'notify_co_approved', label: 'CO Approved', desc: 'When a CO gets approved', category: 'Project Activity' },
  { key: 'notify_delivery_updates', label: 'Deliveries', desc: 'Status changes on shipments', category: 'Project Activity' },
  { key: 'notify_delivery_late', label: 'Late Deliveries', desc: 'When a delivery is past date', category: 'Project Activity', urgent: true },
  { key: 'notify_submittal_overdue', label: 'Submittal Overdue', desc: 'Drawings past due date', category: 'Project Activity', urgent: true },
  { key: 'notify_constraint_added', label: 'New Constraint', desc: 'When a constraint is logged', category: 'Steel Specific' },
  { key: 'notify_fab_released', label: 'Fab Release', desc: 'When a WP moves to fab', category: 'Steel Specific' },
  { key: 'notify_schedule_changes', label: 'Schedule Changes', desc: 'Task dates updated', category: 'Project Activity' },
  { key: 'notify_alerts', label: 'Critical Alerts', desc: 'System-generated alerts', category: 'System', urgent: true },
  { key: 'notify_budget_threshold', label: 'Budget Threshold', desc: 'When cost code hits 90%', category: 'System', urgent: true },
  { key: 'notify_email', label: 'Email Notifications', desc: 'Receive notifications via email', category: 'Delivery' },
  { key: 'notify_daily_digest', label: 'Daily Digest', desc: 'Get daily summary of activity', category: 'Delivery' },
];

const THRESHOLDS = [
  { key: 'rfi_overdue_threshold', label: 'RFI overdue after', unit: 'days', default: 7 },
  { key: 'delivery_late_threshold', label: 'Delivery late after', unit: 'days', default: 1 },
  { key: 'budget_alert_pct', label: 'Budget alert at', unit: '%', default: 90 },
  { key: 'co_stale_days', label: 'CO stale after', unit: 'days', default: 30 },
];

const QUIET_HOURS_DEFAULTS = {
  quiet_hours_enabled: false,
  quiet_hours_start:   '18:00',
  quiet_hours_end:     '07:00',
  quiet_hours_urgent_override: true,
};

const buildDefaults = (preferences) => {
  const defaults = {};
  notifications.forEach(n => {
    defaults[n.key] = preferences?.[n.key] !== undefined ? preferences[n.key] : (n.urgent !== false);
  });
  THRESHOLDS.forEach(t => {
    defaults[t.key] = preferences?.[t.key] ?? t.default;
  });
  Object.entries(QUIET_HOURS_DEFAULTS).forEach(([k, v]) => {
    defaults[k] = preferences?.[k] !== undefined ? preferences[k] : v;
  });
  return defaults;
};

export default function NotificationsTab({ preferences, onSave, isSaving }) {
  const [prefs, setPrefs] = useState(() => buildDefaults(preferences));

  useEffect(() => {
    if (!preferences || Object.keys(preferences).length === 0) return;
    setPrefs(buildDefaults(preferences));
  }, [JSON.stringify(preferences)]);

  const handleToggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    onSave(updated);
  };

  const handleChange = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    onSave(updated);
  };

  const categories = [...new Set(notifications.map(n => n.category))];

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Notifications
      </h2>

      {categories.map(category => (
        <div key={category} style={{ marginBottom: 28 }}>
          <label style={labelStyle}>{category}</label>
          {notifications.filter(n => n.category === category).map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--divider)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
                  {item.urgent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--status-error)', background: 'var(--danger-muted)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.08em' }}>URGENT</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
              <Toggle checked={!!prefs[item.key]} onChange={() => handleToggle(item.key)} />
            </div>
          ))}
        </div>
      ))}

      {/* Urgency Thresholds */}
      <div style={{ marginTop: 28 }}>
        <label style={labelStyle}>Urgency Thresholds</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {THRESHOLDS.map(t => (
            <div key={t.key}>
              <label style={labelStyle}>{t.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min="1" max="365" style={{ ...inputStyle, width: 80 }} value={prefs[t.key] || t.default} onChange={e => handleChange(t.key, Number(e.target.value))} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{t.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--divider)' }}>
        <label style={labelStyle}>Quiet Hours</label>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
          Non-urgent notifications are silenced during these hours. Urgent alerts can still break through.
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '11px 0', borderBottom: '1px solid var(--divider)',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Enable Quiet Hours</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pause non-urgent notifications during a set window.</div>
          </div>
          <Toggle checked={!!prefs.quiet_hours_enabled} onChange={() => handleToggle('quiet_hours_enabled')} />
        </div>

        {prefs.quiet_hours_enabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Start</label>
                <input
                  type="time"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={prefs.quiet_hours_start || '18:00'}
                  onChange={e => handleChange('quiet_hours_start', e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>End</label>
                <input
                  type="time"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={prefs.quiet_hours_end || '07:00'}
                  onChange={e => handleChange('quiet_hours_end', e.target.value)}
                />
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0 11px', marginTop: 6,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Allow urgent alerts</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Let flagged-urgent events still notify you during quiet hours.</div>
              </div>
              <Toggle checked={!!prefs.quiet_hours_urgent_override} onChange={() => handleToggle('quiet_hours_urgent_override')} />
            </div>
          </>
        )}
      </div>

      {isSaving && <div style={{ marginTop: 16, fontSize: 12, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>✓ Saving...</div>}
    </div>
  );
}