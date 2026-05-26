import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * SetupAdminTab — the "Setup & Admin" panel in Settings. Surfaces the
 * admin/setup destinations that used to live in the sidebar as launch cards;
 * clicking one opens its existing full page. Admin-only destinations
 * (User Management, Feature Flags) are hidden from non-admins.
 */
const ITEMS = [
  { page: "Onboarding",        label: "Onboarding",      icon: "▣", desc: "Spin up and configure a new project" },
  { page: "DataExchange",      label: "Data Exchange",   icon: "⇅", desc: "Import / export project data" },
  { page: "Integrations",      label: "Integrations",    icon: "◎", desc: "SharePoint, Bluebeam, and other connections" },
  { page: "UsersManagement",   label: "User Management", icon: "👥", desc: "Users, roles, and access", adminOnly: true },
  { page: "FeatureFlagsAdmin", label: "Feature Flags",   icon: "⚑", desc: "Toggle staged / rollout features", adminOnly: true },
  { page: "Tutorial",          label: "Tutorial / Help", icon: "📘", desc: "Guides and product help" },
];

export default function SetupAdminTab({ isAdmin = false }) {
  const navigate = useNavigate();
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
        Setup, administration, and help — relocated here from the sidebar. Each opens its full page.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {items.map((i) => (
          <button
            key={i.page}
            type="button"
            onClick={() => navigate(createPageUrl(i.page))}
            style={{
              display: "flex", flexDirection: "column", gap: 6, textAlign: "left",
              padding: 16, borderRadius: 10, cursor: "pointer",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.background = "var(--bg-surface-low)"; }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }} aria-hidden="true">{i.icon}</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{i.label}</span>
              {i.adminOnly && (
                <span style={{
                  marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800,
                  letterSpacing: "0.08em", color: "var(--accent)", background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)", borderRadius: 999, padding: "1px 6px",
                }}>ADMIN</span>
              )}
            </span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>{i.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
