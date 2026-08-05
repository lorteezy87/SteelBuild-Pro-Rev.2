/** Pure launch-card catalog for SetupAdminTab. */

export const SETUP_ADMIN_ITEMS = [
  { page: "Onboarding", label: "Onboarding", icon: "▣", desc: "Spin up and configure a new project" },
  { page: "DataExchange", label: "Data Exchange", icon: "⇅", desc: "Import / export project data" },
  { page: "Integrations", label: "Integrations", icon: "◎", desc: "Email, document storage, and other connections" },
  { page: "UsersManagement", label: "User Management", icon: "👥", desc: "Users, roles, and access", adminOnly: true },
  { page: "FeatureFlagsAdmin", label: "Feature Flags", icon: "⚑", desc: "Toggle staged / rollout features", adminOnly: true },
  { page: "Tutorial", label: "Tutorial / Help", icon: "📘", desc: "Guides and product help" },
] as const;
