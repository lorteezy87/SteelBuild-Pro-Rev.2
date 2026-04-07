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
        {activeTab === 'roles' && <RolesTab user={user} />}
        {activeTab === 'system' && <SystemTab user={user} />}
      </div>
    </div>
  );
}

