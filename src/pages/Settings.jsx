import React, { useState, useEffect, useContext } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/components/shared/AuthContext";
import { toast } from "sonner";
import UserSettingsTab from "@/components/settings/UserSettingsTab.jsx";
import NotificationsTab from "@/components/settings/NotificationsTab.jsx";
import DisplayTab from "@/components/settings/DisplayTab.jsx";
import RolesTab from "@/components/settings/RolesTab.jsx";
import SystemTab from "@/components/settings/SystemTab.jsx";

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤', desc: 'Your account information' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', desc: 'Alerts and digest settings' },
  { id: 'display', label: 'Display', icon: '🎨', desc: 'Theme, layout, and format' },
  { id: 'pma', label: 'PMA', icon: '✦', desc: 'AI assistant preferences' },
  { id: 'roles', label: 'Roles', icon: '👑', desc: 'Permissions and access', adminOnly: true },
  { id: 'system', label: 'System', icon: '⚙', desc: 'Data and app management', adminOnly: true },
];

export default function Settings() {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user;
  const isLoadingAuth = authCtx?.isLoadingAuth;
  const [activeTab, setActiveTab] = useState('profile');
  const [userPrefs, setUserPrefs] = useState({});
  const qc = useQueryClient();

  const { data: userSettings } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const me = await base44.auth.me();
      return me || {};
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (userSettings) setUserPrefs(userSettings);
  }, [userSettings]);

  const updatePrefsMut = useMutation({
    mutationFn: async (prefs) => base44.auth.updateMe(prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const handleSavePrefs = (prefs) => {
    setUserPrefs((prev) => ({ ...prev, ...prefs }));
    updatePrefsMut.mutate(prefs);
  };

  if (isLoadingAuth) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          Loading settings...
        </div>
      </div>
    );
  }

  // If auth has finished loading but there's still no user, render the page anyway
  // (the user must be authenticated to reach this route; the guard is in the router).

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 12px', marginBottom: 8 }}>
          Settings
        </div>
        {TABS.filter(tab => !tab.adminOnly || user?.role === 'admin').map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              padding: '10px 12px',
              background: activeTab === tab.id ? 'var(--accent-muted)' : 'transparent',
              border: `1px solid ${activeTab === tab.id ? 'var(--accent-border)' : 'transparent'}`,
              borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-primary)' }}>
                {tab.label}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', paddingLeft: 22 }}>
              {tab.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-card)', padding: 28, minHeight: 500 }}>
        {activeTab === 'profile' && <UserSettingsTab user={user} onSave={handleSavePrefs} />}
        {activeTab === 'notifications' && <NotificationsTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'display' && <DisplayTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'pma' && <PMASettingsTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'roles' && <RolesTab user={user} />}
        {activeTab === 'system' && <SystemTab user={user} />}
      </div>
    </div>
  );
}

function PMASettingsTab({ preferences, onSave, isSaving }) {
  const [prefs, setPrefs] = useState({
    pma_role: preferences?.pma_role || 'pm',
    pma_custom_instructions: preferences?.pma_custom_instructions || localStorage.getItem('pma_custom_instructions') || '',
    pma_auto_briefing: preferences?.pma_auto_briefing !== false,
    pma_briefing_time: preferences?.pma_briefing_time || '07:00',
  });

  useEffect(() => {
    setPrefs(prev => ({
      ...prev,
      pma_role: preferences?.pma_role || prev.pma_role,
      pma_custom_instructions: preferences?.pma_custom_instructions || prev.pma_custom_instructions,
      pma_auto_briefing: preferences?.pma_auto_briefing !== undefined ? preferences.pma_auto_briefing : prev.pma_auto_briefing,
      pma_briefing_time: preferences?.pma_briefing_time || prev.pma_briefing_time,
    }));
  }, [preferences]);

  const handleChange = (k, v) => {
    const updated = { ...prefs, [k]: v };
    setPrefs(updated);
    if (k === 'pma_custom_instructions') localStorage.setItem('pma_custom_instructions', v);
    onSave(updated);
  };

  const S = {
    section: { marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--divider)' },
    sectionTitle: { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, display: 'block' },
    label: { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' },
    input: { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none', boxSizing: 'border-box' },
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        ✦ PMA Settings
      </h2>

      {/* Role */}
      <div style={S.section}>
        <span style={S.sectionTitle}>Default Role</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { id: 'pm', label: 'Project Manager', desc: 'Full project oversight', icon: '👔' },
            { id: 'super', label: 'Superintendent', desc: 'Field & erection focus', icon: '🦺' },
            { id: 'estimator', label: 'Estimator', desc: 'Cost & scope focus', icon: '🧮' },
          ].map(role => (
            <div key={role.id} onClick={() => handleChange('pma_role', role.id)} style={{ padding: '14px', background: prefs.pma_role === role.id ? 'var(--accent-muted)' : 'var(--bg-surface-low)', border: `1px solid ${prefs.pma_role === role.id ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{role.icon}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: prefs.pma_role === role.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>{role.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{role.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom instructions */}
      <div style={S.section}>
        <span style={S.sectionTitle}>Custom Instructions</span>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          Tell PMA how you want it to respond. These instructions are always included in every briefing and chat.
        </p>
        <textarea
          value={prefs.pma_custom_instructions}
          onChange={e => handleChange('pma_custom_instructions', e.target.value)}
          placeholder={'Examples:\n- Always flag schedule impacts first\n- I am managing a Davis Bacon project\n- We have a hard completion date of Oct 15\n- Always recommend RFI action items'}
          style={{ ...S.input, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
        />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.08em' }}>
          {prefs.pma_custom_instructions?.length || 0} characters
        </div>
      </div>

      {/* Auto briefing */}
      <div>
        <span style={S.sectionTitle}>Briefing Options</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Auto-generate briefing on open</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Generate daily briefing when PMA panel opens</div>
          </div>
          <div onClick={() => handleChange('pma_auto_briefing', !prefs.pma_auto_briefing)} style={{ width: 44, height: 24, background: prefs.pma_auto_briefing ? 'var(--status-success)' : 'var(--bg-surface-high)', borderRadius: 12, padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: prefs.pma_auto_briefing ? 'flex-end' : 'flex-start', transition: 'all 0.2s', flexShrink: 0 }}>
            <div style={{ width: 20, height: 20, background: '#fff', borderRadius: 10 }} />
          </div>
        </div>
      </div>
    </div>
  );
}