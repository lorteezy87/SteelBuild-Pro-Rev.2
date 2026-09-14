/** Shared drawer surface tokens for TaskDetailDrawer presentational slices. */
export const drawerSurface = "var(--bg-surface-secondary)";
export const drawerPanel = "var(--bg-surface-low)";
export const drawerPanelStrong = "var(--bg-surface-high)";
export const drawerBorder = "var(--border-default)";
export const drawerMutedBorder = "var(--divider)";
export const drawerText = "var(--text-primary)";
export const drawerMutedText = "var(--text-muted)";

export const drawerControlStyle = {
  width: "100%",
  background: drawerPanelStrong,
  border: `1px solid ${drawerBorder}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: drawerText,
  boxSizing: "border-box",
  colorScheme: "dark",
  outline: "none",
} as const;
