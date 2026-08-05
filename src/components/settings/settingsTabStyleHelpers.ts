/** Shared pure style tokens for settings sub-tabs. */

export const SETTINGS_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 12,
  display: "block",
};

export const SETTINGS_SECTION_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "18px 16px",
  marginBottom: 20,
};

export const PERM_BADGE_CONFIG: Record<
  string,
  { color: string; text: string }
> = {
  create: { color: "var(--status-success)", text: "✓ Create" },
  read: { color: "var(--accent)", text: "✓ Read" },
  update: { color: "var(--status-warning)", text: "✓ Update" },
  delete: { color: "var(--status-error)", text: "✗ Delete" },
};

export const ROLE_DESCRIPTIONS: Record<
  string,
  { title: string; description: string; permissions: string[] }
> = {
  admin: {
    title: "Administrator",
    description: "Full access to all features and settings",
    permissions: ["create", "read", "update", "delete"],
  },
  user: {
    title: "User",
    description: "Access to project features and documents",
    permissions: ["create", "read", "update"],
  },
};

export function permBadgeStyle(
  color: string,
): Record<string, string | number> {
  return {
    display: "inline-block",
    background: color + "22",
    border: `1px solid ${color}44`,
    color,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 600,
    marginRight: 6,
    marginBottom: 4,
  };
}

