/**
 * Pure chrome styles for DesktopConnectShell.
 */

export const desktopConnectHeading = {
  fontFamily: "'Space Grotesk', var(--font-display)",
  fontSize: 24,
  fontWeight: 600,
  color: "var(--text-primary)",
  margin: "10px 0 6px",
} as const;

export const desktopConnectBody = {
  color: "var(--text-muted)",
  fontSize: 13,
  lineHeight: 1.6,
  margin: "0 0 22px",
} as const;

export const desktopConnectLabel = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  marginBottom: 6,
};

export const desktopConnectErrorBox = {
  padding: "10px 14px",
  background: "var(--danger-muted, rgba(220, 38, 38, 0.12))",
  border: "1px solid var(--danger-border, rgba(220, 38, 38, 0.35))",
  borderRadius: 9,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--status-error)",
  lineHeight: 1.5,
} as const;
