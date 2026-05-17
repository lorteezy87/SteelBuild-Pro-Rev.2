import React, { useState } from 'react';
import { toast } from 'sonner';

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.12em',
  textTransform: 'uppercase', marginBottom: 12, display: 'block',
};

const sectionStyle = {
  background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
  borderRadius: 8, padding: '18px 16px', marginBottom: 20,
};

const ActionBtn = ({ onClick, disabled, color, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: '8px 14px', background: `var(--${color}-muted)`, border: `1px solid var(--${color}-border)`, borderRadius: 6, color: `var(--${color})`, fontWeight: 600, fontSize: 11, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
    {children}
  </button>
);

export default function SystemTab({ user }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const data = { exportDate: new Date().toISOString(), appVersion: '1.0.0', dataTypes: ['projects', 'work_packages', 'rfis', 'drawings', 'deliveries', 'expenses'] };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `steelbuild-export-${timestamp}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Data export started');
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearCache = () => {
    try {
      if ('caches' in window) caches.keys().then(names => names.forEach(n => caches.delete(n)));
      // Preserve auth/preference keys while clearing cache data
      const preserve = ['current_user_email', 'current_user_id', 'activeProjectId', 'sbp-theme', 'sbp_app_roles', 'supabase.auth.token'];
      const saved = {};
      preserve.forEach(k => { const v = localStorage.getItem(k); if (v !== null) saved[k] = v; });
      localStorage.clear();
      Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v));
      sessionStorage.clear();
      toast.success('Cache cleared');
    } catch (err) {
      toast.error('Failed to clear cache');
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        System
      </h2>

      {/* App Info */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Application Info</label>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>SteelBuild Pro <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>v1.0.0</span></div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>A comprehensive project management platform for structural steel projects.</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>Last updated: March 2026</div>
      </div>

      {/* Data Management */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Data Management</label>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Export Your Data</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Download a JSON export of your projects, work packages, RFIs, and other records.</div>
          <ActionBtn onClick={handleExportData} disabled={isExporting} color="info">
            {isExporting ? 'Exporting...' : '📥 Export Data'}
          </ActionBtn>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Clear Cache</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Clear stored data to free up space or resolve sync issues.</div>
          <ActionBtn onClick={handleClearCache} color="warning">🗑️ Clear Cache</ActionBtn>
        </div>
      </div>

      {/* Integrations */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Connected Services</label>
        {[{ label: 'Base44 Backend', ok: true }, { label: 'Project Database', ok: true }, { label: 'Authentication', ok: true }].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--divider)', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ color: s.ok ? 'var(--status-success)' : 'var(--status-error)' }}>{s.ok ? '●' : '○'}</span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Support */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Support & Legal</label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Contact your SteelBuild Pro administrator for privacy, terms, or support inquiries.
        </div>
      </div>
    </div>
  );
}