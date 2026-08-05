import type { ReactNode } from "react";
import {
  DESKTOP_CONNECT_PAGE_STYLE,
  DESKTOP_CONNECT_CARD_STYLE,
  DESKTOP_CONNECT_BRAND_STYLE,
  DESKTOP_CONNECT_PRODUCT_STYLE,
  DESKTOP_CONNECT_TITLE_STYLE,
  DESKTOP_CONNECT_SUBTITLE_STYLE,
  DESKTOP_CONNECT_FOOTER_STYLE,
} from "./desktopConnectHelpers";

interface DesktopConnectShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Optional footer line (e.g. security note). */
  footer?: ReactNode;
}

/**
 * Full-screen auth-style shell for Desktop Command Center handoff pages.
 * Matches OrgOnboarding / LocalLoginForm token usage so the flow feels
 * complete inside the system browser rather than a bare inline prototype.
 */
export function DesktopConnectShell({ title, subtitle, children, footer }: DesktopConnectShellProps) {
  return (
    <div style={DESKTOP_CONNECT_PAGE_STYLE}>
      <section
        style={DESKTOP_CONNECT_CARD_STYLE}
        aria-labelledby="desktop-connect-title"
      >
        <div style={DESKTOP_CONNECT_BRAND_STYLE}>
          SteelBuild Pro
        </div>
        <p style={DESKTOP_CONNECT_PRODUCT_STYLE}>
          Desktop Command Center
        </p>
        <h1
          id="desktop-connect-title"
          style={DESKTOP_CONNECT_TITLE_STYLE}
        >
          {title}
        </h1>
        {subtitle ? (
          <p style={DESKTOP_CONNECT_SUBTITLE_STYLE}>
            {subtitle}
          </p>
        ) : null}
        {children}
        {footer ? (
          <p style={DESKTOP_CONNECT_FOOTER_STYLE}>
            {footer}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export {
  desktopConnectHeading,
  desktopConnectBody,
  desktopConnectLabel,
  desktopConnectErrorBox,
} from "./desktopConnectHelpers";

export function DesktopConnectSpinner({ label = "Working…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0 4px" }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          border: "3px solid var(--border-default)",
          borderTop: "3px solid var(--accent)",
          borderRadius: "50%",
          animation: "desktop-connect-spin 0.8s linear infinite",
        }}
      />
      <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{label}</span>
      <style>{`@keyframes desktop-connect-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
