import React, { useState, useEffect, useContext, useCallback } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/api/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import UserSettingsTab from "@/components/settings/UserSettingsTab.jsx";
import { CommandBar } from "@/components/design-system";
import NotificationsTab from "@/components/settings/NotificationsTab.jsx";
import DisplayTab from "@/components/settings/DisplayTab.jsx";
import DashboardTab from "@/components/settings/DashboardTab.jsx";
import ShortcutsTab from "@/components/settings/ShortcutsTab.jsx";
import RolesTab from "@/components/settings/RolesTab.jsx";
import SystemTab from "@/components/settings/SystemTab.jsx";
import CostCodesTab from "@/components/settings/CostCodesTab.jsx";
import SetupAdminTab from "@/components/settings/SetupAdminTab.jsx";
import { useFlag } from "@/hooks/useFeatureFlag";
import SettingsControlCenter from "./settings/SettingsControlCenter";

// Settings are grouped into three levels: personal, workspace, admin.
const TAB_GROUPS = [
  {
    id: 'personal',
    label: 'My Settings',
    tabs: [
      { id: 'profile',       label: 'Profile',       icon: '\u{1F464}', desc: 'Your account information' },
      { id: 'display',       label: 'Display',       icon: '\u{1F3A8}', desc: 'Theme, accent, accessibility, locale' },
      { id: 'dashboard',     label: 'Dashboard',     icon: '\u{1F4CA}', desc: 'Pinned modules, KPI order, default project' },
      { id: 'notifications', label: 'Notifications', icon: '\u{1F514}', desc: 'Alerts, digests, and quiet hours' },
      { id: 'shortcuts',     label: 'Shortcuts',     icon: '⌨',    desc: 'Keyboard reference card' },
    ],
  },
  {
    id: 'setup-help',
    label: 'Setup & Help',
    tabs: [
      { id: 'setup', label: 'Setup & Admin', icon: '🧩', desc: 'Onboarding, data exchange, integrations, users, feature flags, help' },
    ],
  },
  {
    id: 'admin',
    label: 'Workspace',
    adminOnly: true,
    tabs: [
      { id: 'roles',      label: 'Roles',      icon: '\u{1F451}', desc: 'Permissions and access', adminOnly: true },
      { id: 'costcodes',  label: 'Cost Codes', icon: '\u{1F4B0}', desc: 'Default budget codes for new projects', adminOnly: true },
      { id: 'system',     label: 'System',     icon: '\u2699',    desc: 'Data and app management', adminOnly: true },
    ],
  },
];

const ALL_TABS = TAB_GROUPS.flatMap(g => g.tabs);

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function Settings() {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user;
  const isLoadingAuth = authCtx?.isLoadingAuth;
  const [activeTab, setActiveTab] = useState('profile');
  const [userPrefs, setUserPrefs] = useState({});
  const [showSaved, setShowSaved] = useState(false);
  const [hoveredTab, setHoveredTab] = useState(null);
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const commandUi = useFlag("command_ui");

  const { data: userSettings } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const me = await auth.me();
      return me || {};
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (userSettings) setUserPrefs(userSettings);
  }, [userSettings]);

  const updatePrefsMut = useMutation({
    mutationFn: async (prefs) => auth.updateMe(prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Settings saved');
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const handleSavePrefs = useCallback((prefs) => {
    setUserPrefs((prev) => ({ ...prev, ...prefs }));
    updatePrefsMut.mutate(prefs);
  }, [updatePrefsMut]);

  if (isLoadingAuth) {
    return <LoadingSkeleton variant="page" />;
  }

  // If auth has finished loading but there's still no user, render the page anyway
  // (the user must be authenticated to reach this route; the guard is in the router).

  const isAdmin = user?.role === 'admin';
  const visibleGroups = TAB_GROUPS
    .filter(group => !group.adminOnly || isAdmin)
    .map(group => ({
      ...group,
      tabs: group.tabs.filter(tab => !tab.adminOnly || isAdmin),
    }))
    .filter(group => group.tabs.length > 0);

  const activeTabMeta = ALL_TABS.find(t => t.id === activeTab);

  // Shared settings body (sidebar tabs + content card) — rendered in both paths.
  // Extracted here so the command_ui branch can pass it as children without
  // duplicating any of the form wiring or mutation logic.
  const settingsBody = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '220px 1fr',
      gap: isMobile ? 16 : 24,
    }}>
      {/* Sidebar */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        flexWrap: isMobile ? 'wrap' : 'nowrap',
        gap: 4,
      }}>
        {visibleGroups.map((group, groupIdx) => (
          <React.Fragment key={group.id}>
            {!isMobile && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '0 12px',
                marginTop: groupIdx === 0 ? 0 : 18,
                marginBottom: 8,
              }}>
                {group.label}
              </div>
            )}
            {group.tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const isHovered = hoveredTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => setHoveredTab(tab.id)}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    alignItems: isMobile ? 'center' : 'flex-start',
                    gap: isMobile ? 8 : 2,
                    padding: '10px 12px',
                    background: isActive
                      ? 'var(--accent-muted)'
                      : isHovered
                        ? 'var(--hover-bg)'
                        : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
                    borderLeft: !isMobile && isActive ? '3px solid var(--accent)' : !isMobile ? '3px solid transparent' : undefined,
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    flex: isMobile ? '0 0 auto' : undefined,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{tab.icon}</span>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                    }}>
                      {tab.label}
                    </span>
                    {isActive && showSaved && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        fontWeight: 700,
                        color: 'var(--success)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        animation: 'fadeIn 0.2s ease',
                      }}>
                        SAVED
                      </span>
                    )}
                  </div>
                  {!isMobile && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      paddingLeft: 22,
                    }}>
                      {tab.desc}
                    </div>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Content — key forces remount on tab switch for the fade animation */}
      <div
        key={activeTab}
        className="sbd-card"
        style={{
          padding: isMobile ? 16 : 28,
          minHeight: isMobile ? 300 : 500,
          animation: 'fadeIn 0.2s ease',
        }}
      >
        {activeTab === 'profile' && (
          <UserSettingsTab
            user={user}
            onSave={handleSavePrefs}
            isSaving={updatePrefsMut.isPending}
            lockIcon /* email is read-only; UserSettingsTab can use this to show a lock icon */
          />
        )}
        {activeTab === 'notifications' && <NotificationsTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'display' && <DisplayTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'dashboard' && <DashboardTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === 'shortcuts' && <ShortcutsTab />}
        {activeTab === 'roles' && <RolesTab user={user} />}
        {activeTab === 'costcodes' && <CostCodesTab />}
        {activeTab === 'system' && <SystemTab user={user} />}
        {activeTab === 'setup' && <SetupAdminTab isAdmin={isAdmin} />}
      </div>
    </div>
  );

  // command_ui flag-branch: wrap the same body in the light Command UI shell.
  // All form saves, tab navigation, and mutations are unchanged — the body is
  // identical; only the page chrome differs.
  if (commandUi) {
    return (
      <SettingsControlCenter
        user={user}
        prefs={userPrefs}
        visibleSectionCount={visibleGroups.reduce((n, g) => n + g.tabs.length, 0)}
      >
        {settingsBody}
      </SettingsControlCenter>
    );
  }

  // Classic (non-flag) path — unchanged chrome, same body.
  return (
    <div className="sb-dashboard-reference-page">
      <CommandBar
        eyebrow={isAdmin ? "PERSONAL · WORKSPACE" : "PERSONAL"}
        title="Settings"
        subtitle={`${user?.full_name || user?.email || "Signed in"} · ${activeTabMeta?.label || "Profile"}${activeTabMeta?.desc ? ` · ${activeTabMeta.desc}` : ""}`}
      />
      {settingsBody}
    </div>
  );
}
