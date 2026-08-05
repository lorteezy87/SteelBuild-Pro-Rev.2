import type { ReactNode } from "react";

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
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--bg-base, #0D1117)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg-surface-secondary, #161B22)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          padding: "32px 28px",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
        }}
        aria-labelledby="desktop-connect-title"
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--accent)",
            fontWeight: 800,
          }}
        >
          SteelBuild Pro
        </div>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Desktop Command Center
        </p>
        <h1
          id="desktop-connect-title"
          style={{
            fontFamily: "'Space Grotesk', var(--font-display)",
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "10px 0 6px",
            lineHeight: 1.25,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.6,
              margin: "0 0 22px",
            }}
          >
            {subtitle}
          </p>
        ) : null}
        {children}
        {footer ? (
          <p
            style={{
              margin: "20px 0 0",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--text-muted)",
            }}
          >
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
