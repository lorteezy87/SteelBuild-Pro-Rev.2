import React, { useState } from 'react';
import { toast } from 'sonner';
import { entities } from '@/api/supabaseClient';
import { useOrg } from '@/components/shared/OrgContext';
import { exportWorkspace, downloadWorkspaceExport } from '@/lib/workspaceExport';

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
  const { currentOrg } = useOrg();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Real workspace backup: pull every project the caller can access and export
  // each through the RLS-scoped, audited `project-export` Edge Function, then
  // bundle them into one downloadable JSON. (Replaces a placeholder that
  // downloaded only a list of table names — no actual data.)
  const handleExportData = async () => {
    setIsExporting(true);
    setExportMsg('Gathering projects…');
    try {
      const projects = await entities.Project.list();
      if (!projects?.length) {
        toast.error('No projects to export yet.');
        return;
      }
      const bundle = await exportWorkspace(projects, {
        workspaceName: currentOrg?.name,
        onProgress: (done, total, name) =>
          setExportMsg(name ? `Exporting ${Math.min(done + 1, total)} of ${total}: ${name}…` : 'Packaging backup…'),
      });
      downloadWorkspaceExport(bundle);
      const skipped = bundle.failures.length;
      toast.success(
        `Exported ${bundle.project_count} project${bundle.project_count === 1 ? '' : 's'} · ` +
        `${bundle.total_rows.toLocaleString()} rows` +
        (skipped ? ` · ${skipped} skipped` : ''),
      );
    } catch (err) {
      toast.error('Export failed: ' + (err?.message || String(err)));
    } finally {
      setIsExporting(false);
      setExportMsg('');
    }
  };

  const handleClearCache = () => {
    try {
      if ('caches' in window) caches.keys().then(names => names.forEach(n => caches.delete(n)));
      // Preserve auth/preference keys while clearing cache data
      const preserve = ['current_user_email', 'current_user_id', 'activeProjectId', 'sbp-theme', 'supabase.auth.token'];
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
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Download a complete JSON backup of every project in your workspace — drawings, submittals, RFIs, change orders, schedule, costs, and more. Each export is recorded in your activity log.</div>
          <ActionBtn onClick={handleExportData} disabled={isExporting} color="info">
            {isExporting ? 'Exporting…' : '📥 Export Data'}
          </ActionBtn>
          {isExporting && exportMsg && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>{exportMsg}</div>
          )}
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
        {[{ label: 'Supabase Backend', ok: true }, { label: 'Project Database', ok: true }, { label: 'Authentication', ok: true }].map(s => (
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