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

export const DESKTOP_CONNECT_PAGE_STYLE: Record<string, string | number> = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "var(--bg-base, #0D1117)",
};

export const DESKTOP_CONNECT_CARD_STYLE: Record<string, string | number> = {
  width: "100%",
  maxWidth: 460,
  background: "var(--bg-surface-secondary, #161B22)",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: "32px 28px",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
};

export const DESKTOP_CONNECT_BRAND_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--accent)",
  fontWeight: 800,
};

export const DESKTOP_CONNECT_PRODUCT_STYLE: Record<string, string | number> = {
  margin: "10px 0 0",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export const DESKTOP_CONNECT_TITLE_STYLE: Record<string, string | number> = {
  fontFamily: "'Space Grotesk', var(--font-display)",
  fontSize: 24,
  fontWeight: 600,
  color: "var(--text-primary)",
  margin: "10px 0 6px",
  lineHeight: 1.25,
};

export const DESKTOP_CONNECT_SUBTITLE_STYLE: Record<string, string | number> = {
  color: "var(--text-muted)",
  fontSize: 13,
  lineHeight: 1.6,
  margin: "0 0 22px",
};

export const DESKTOP_CONNECT_FOOTER_STYLE: Record<string, string | number> = {
  margin: "20px 0 0",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};
