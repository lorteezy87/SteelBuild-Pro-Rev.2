import React, { useState, useEffect, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/components/shared/AuthContext";
import { toast } from "sonner";
import UserSettingsTab from "@/components/settings/UserSettingsTab.jsx";
import NotificationsTab from "@/components/settings/NotificationsTab.jsx";
import DisplayTab from "@/components/settings/DisplayTab.jsx";
import RolesTab from "@/components/settings/RolesTab.jsx";
import SystemTab from "@/components/settings/SystemTab.jsx";

const TABS = [
  { id: "profile", label: "Profile", icon: "👤", desc: "Your account information" },
  { id: "notifications", label: "Notifications", icon: "🔔", desc: "Alerts and digest settings" },
  { id: "display", label: "Display", icon: "🎨", desc: "Theme, layout, and format" },
  { id: "control-center", label: "Control Center", icon: "🎯", desc: "Operational rules and scoring model" },
  { id: "roles", label: "Roles", icon: "👑", desc: "Permissions and access", adminOnly: true },
  { id: "system", label: "System", icon: "⚙", desc: "Data and app management", adminOnly: true },
];

export default function Settings() {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user;
  const checkAppState = authCtx?.checkAppState;
  const logout = authCtx?.logout;
  const [activeTab, setActiveTab] = useState("profile");
  const [userPrefs, setUserPrefs] = useState({});
  const qc = useQueryClient();

  useEffect(() => {
    if (user) setUserPrefs(user);
  }, [user]);

  const updatePrefsMut = useMutation({
    mutationFn: async (prefs) => base44.auth.updateMe(prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-settings"] });
      checkAppState?.();
      toast.success("Settings saved");
    },
    onError: async (error) => {
      if (error?.status === 401) {
        toast.error("Your session expired. Please sign in again.");
        await logout?.();
        return;
      }
      toast.error("Failed to save settings");
    },
  });

  const handleSavePrefs = (prefs) => {
    setUserPrefs((prev) => ({ ...prev, ...prefs }));
    return updatePrefsMut.mutateAsync(prefs);
  };

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "0 12px", marginBottom: 8 }}>
          Settings
        </div>
        {TABS.filter((tab) => !tab.adminOnly || user?.role === "admin").map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              padding: "10px 12px",
              background: activeTab === tab.id ? "var(--accent-muted)" : "transparent",
              border: `1px solid ${activeTab === tab.id ? "var(--accent-border)" : "transparent"}`,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: activeTab === tab.id ? "var(--accent)" : "var(--text-primary)" }}>
                {tab.label}
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", paddingLeft: 22 }}>{tab.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 28, minHeight: 500 }}>
        {activeTab === "profile" && <UserSettingsTab user={user} onSave={handleSavePrefs} />}
        {activeTab === "notifications" && <NotificationsTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === "display" && <DisplayTab preferences={userPrefs} onSave={handleSavePrefs} isSaving={updatePrefsMut.isPending} />}
        {activeTab === "control-center" && <ControlCenterSettingsTab />}
        {activeTab === "roles" && <RolesTab user={user} />}
        {activeTab === "system" && <SystemTab user={user} />}
      </div>
    </div>
  );
}

function ControlCenterSettingsTab() {
  const sectionTitleStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: 16,
    display: "block",
  };

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 24px 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Project Control Center
      </h2>

      <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid var(--divider)" }}>
        <span style={sectionTitleStyle}>Purpose</span>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          Project Control Center replaces PMA with a deterministic command surface. It ranks issues from live RFIs, drawing revisions,
          deliveries, schedule tasks, change orders, costs, and constraints so project managers can trust what they are seeing.
        </p>
      </div>

      <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid var(--divider)" }}>
        <span style={sectionTitleStyle}>Priority Inputs</span>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.7 }}>
          <li>Overdue days and items due within 3 days</li>
          <li>Fabrication, delivery, and erection impact keywords</li>
          <li>Approval dependency and pending external response</li>
          <li>Change order exposure and budget pressure</li>
          <li>Unacknowledged revisions and unresolved field coordination</li>
          <li>Critical-path or near-critical schedule pressure</li>
        </ul>
      </div>

      <div>
        <span style={sectionTitleStyle}>Operational Use</span>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.7 }}>
          <li>Use Today’s Priorities during the morning project scan.</li>
          <li>Use Waiting On during GC, engineer, and internal coordination meetings.</li>
          <li>Use Risk Watchlist before weekly production and cost reviews.</li>
          <li>Use Recommended Next Actions to push deterministic follow-up, not assistant chatter.</li>
        </ul>
      </div>
    </div>
  );
}
