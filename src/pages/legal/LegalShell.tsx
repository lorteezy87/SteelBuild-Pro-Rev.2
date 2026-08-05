/**
 * Shared chrome for public legal/trust pages (Terms, Privacy, Security, Subprocessors).
 * Presentational only — no network. Behavior-preserving extract from the four pages.
 */
import React, { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

export const LEGAL_C = {
  base: "#0B0E11",
  surface: "#0F141A",
  card: "#161C24",
  cardHi: "#1B232E",
  line: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.12)",
  ink: "#F2F4F7",
  body: "#AEB7C2",
  muted: "#727B86",
  gold: "#C89B20",
  goldB: "#E6B53C",
} as const;

export const LEGAL_F = {
  disp: "'Barlow Condensed', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

/** @deprecated Prefer LEGAL_C — kept as alias for page readability */
export const C = LEGAL_C;
/** @deprecated Prefer LEGAL_F */
export const F = LEGAL_F;

export const legalUlStyle: CSSProperties = {
  margin: "12px 0",
  paddingLeft: 22,
  display: "flex",
  flexDirection: "column",
  gap: 9,
};

export const legalStrong: CSSProperties = { color: LEGAL_C.ink, fontWeight: 600 };

export const legalInlineLink: CSSProperties = {
  color: LEGAL_C.goldB,
  textDecoration: "none",
  borderBottom: "1px solid rgba(230,181,60,0.4)",
};

export const legalTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14.5,
};

export const legalThStyle: CSSProperties = {
  textAlign: "left",
  fontFamily: LEGAL_F.mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: LEGAL_C.goldB,
  padding: "10px 14px",
  borderBottom: `1px solid ${LEGAL_C.line2}`,
  verticalAlign: "bottom",
};

export const legalTdStyle: CSSProperties = {
  padding: "13px 14px",
  borderBottom: `1px solid ${LEGAL_C.line}`,
  color: LEGAL_C.body,
  lineHeight: 1.6,
  verticalAlign: "top",
};

/** Paint html/body near-black while a legal page is mounted; restore on unmount. */
export function useLegalPageBackground(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = LEGAL_C.base;
    body.style.background = LEGAL_C.base;
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, []);
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 38 }}>
      <h2
        style={{
          fontFamily: LEGAL_F.disp,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "0.01em",
          textTransform: "uppercase",
          color: LEGAL_C.ink,
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export type LegalShellProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
  /** Eyebrow above the H1. Terms/Privacy use "Legal"; Security uses "Trust". */
  eyebrow?: string;
  /** When true, footer includes Subprocessors link (Subprocessors page). */
  showSubprocessorsFooterLink?: boolean;
};

export function LegalShell({
  title,
  lastUpdated,
  children,
  eyebrow = "Legal",
  showSubprocessorsFooterLink = false,
}: LegalShellProps) {
  const C = LEGAL_C;
  const F = LEGAL_F;
  return (
    <div
      style={{
        background: C.base,
        color: C.body,
        minHeight: "100vh",
        fontFamily: F.body,
        overflowX: "hidden",
      }}
    >
      <style>{`
        .legal-body { font-size: 15.5px; line-height: 1.75; color: ${C.body}; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body li { line-height: 1.7; }
        .legal-body a:hover { color: ${C.goldB}; }
        .legal-topbar-link { color: ${C.body}; text-decoration: none; font-size: 14px; transition: color 0.15s; }
        .legal-topbar-link:hover { color: ${C.goldB}; }
        @media (max-width: 620px) {
          .legal-wrap { padding: 0 20px !important; }
          .legal-main { padding: 40px 0 64px !important; }
        }
      `}</style>

      <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldB})` }} />

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(11,14,17,0.82)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div
          className="legal-wrap"
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 64,
          }}
        >
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: `linear-gradient(150deg, ${C.cardHi}, ${C.surface})`,
                border: `1px solid ${C.line2}`,
                display: "grid",
                placeItems: "center",
                color: C.goldB,
                fontFamily: F.disp,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.04em",
                boxShadow: "0 0 18px -6px rgba(230,181,60,0.5)",
              }}
            >
              SB
            </div>
            <span
              style={{
                fontFamily: F.disp,
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "0.12em",
                color: C.ink,
              }}
            >
              STEELBUILD&nbsp;PRO
            </span>
          </Link>
          <Link to="/" className="legal-topbar-link">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="legal-main" style={{ padding: "60px 0 80px" }}>
        <div className="legal-wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: C.goldB,
            }}
          >
            {eyebrow}
          </span>
          <h1
            style={{
              fontFamily: F.disp,
              fontWeight: 800,
              fontSize: "clamp(36px, 6vw, 56px)",
              lineHeight: 1.0,
              letterSpacing: "0.005em",
              textTransform: "uppercase",
              color: C.ink,
              margin: "14px 0 0",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontFamily: F.mono,
              fontSize: 12.5,
              color: C.muted,
              margin: "16px 0 0",
              letterSpacing: "0.04em",
            }}
          >
            Last updated: {lastUpdated}
          </p>
          <div style={{ height: 1, background: C.line, margin: "28px 0 4px" }} />

          <div className="legal-body">{children}</div>
        </div>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, background: C.surface }}>
        <div
          className="legal-wrap"
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "26px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <span style={{ fontFamily: F.mono, fontSize: 11.5, letterSpacing: "0.06em", color: C.muted }}>
            © {new Date().getFullYear()} SteelBuild Pro LLC
          </span>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Link to="/privacy" className="legal-topbar-link">
              Privacy
            </Link>
            <Link to="/terms" className="legal-topbar-link">
              Terms
            </Link>
            <Link to="/security" className="legal-topbar-link">
              Security
            </Link>
            {showSubprocessorsFooterLink ? (
              <Link to="/subprocessors" className="legal-topbar-link">
                Subprocessors
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
