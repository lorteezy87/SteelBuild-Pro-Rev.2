/**
 * Shared shell for the public legal and trust pages (Terms, Privacy, Security,
 * Subprocessors). These render without the app Layout, so they cannot read
 * the app's CSS tokens: the palette comes from the Board Report design
 * system's own constants (boardReportTheme.ts), the same source the app-wide
 * layer mirrors. Dark masthead header over a light paper reading column.
 */
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DC_FONT, DC_LIGHT, DC_MASTHEAD, DC_SIGNAL } from "@/pages/documentControl/boardReportTheme";

export const LEGAL_C = {
  base: DC_LIGHT.pageBg,
  surface: DC_LIGHT.wellBg,
  card: DC_LIGHT.paneBg,
  cardHi: DC_LIGHT.rowHover,
  line: DC_LIGHT.rowBorder,
  line2: DC_LIGHT.paneBorder,
  ink: DC_LIGHT.text,
  body: DC_LIGHT.textSecondary,
  muted: DC_LIGHT.textMuted,
  accent: DC_SIGNAL.accent,
  /** Orange that holds 4.5:1 on paper — links and labels. */
  accentText: DC_SIGNAL.accentInk,
} as const;

export const LEGAL_F = {
  disp: DC_FONT.ui,
  body: DC_FONT.ui,
  mono: DC_FONT.mono,
} as const;

const C = LEGAL_C;
const F = LEGAL_F;

export const ulStyle: CSSProperties = { margin: "12px 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 9 };
export const strong: CSSProperties = { color: C.ink, fontWeight: 600 };
export const inlineLink: CSSProperties = { color: C.accentText, textDecoration: "none", borderBottom: `1px solid ${C.line2}` };
export const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14.5 };
export const thStyle: CSSProperties = {
  textAlign: "left", fontFamily: F.mono, fontSize: 11, fontWeight: 500,
  letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted,
  padding: "10px 14px", borderBottom: `1px solid ${C.ink}`, verticalAlign: "bottom", whiteSpace: "nowrap",
};
export const tdStyle: CSSProperties = {
  padding: "13px 14px", borderBottom: `1px solid ${C.line}`,
  color: C.body, lineHeight: 1.6, verticalAlign: "top",
};

/** Paint html/body with the page base while mounted so overscroll matches; restore on unmount. */
export function useLegalPageBackground() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = C.base;
    body.style.background = C.base;
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, []);
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 38 }}>
      <h2 style={{
        fontFamily: F.disp, fontWeight: 700, fontSize: 24, fontStretch: "85%", letterSpacing: "-0.01em",
        color: C.ink, margin: "0 0 12px",
      }}>{title}</h2>
      {children}
    </section>
  );
}

export function LegalShell({ title, lastUpdated, eyebrow = "Legal", children }: {
  title: string;
  lastUpdated: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ background: C.base, color: C.body, minHeight: "100vh", fontFamily: F.body, overflowX: "hidden" }}>
      <style>{`
        .legal-body { font-size: 15.5px; line-height: 1.75; color: ${C.body}; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body li { line-height: 1.7; }
        .legal-body a:hover { color: ${C.ink}; }
        .legal-topbar-link { display: inline-flex; align-items: center; color: ${DC_MASTHEAD.muted}; text-decoration: none; font-size: 14px; white-space: nowrap; transition: color 0.15s; }
        .legal-topbar-link:hover { color: ${DC_MASTHEAD.fg}; }
        .legal-footer-link { color: ${C.body}; text-decoration: none; font-size: 14px; transition: color 0.15s; }
        .legal-footer-link:hover { color: ${C.accentText}; }
        .legal-shell a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        @media (max-width: 620px) {
          .legal-wrap { padding: 0 16px !important; }
          .legal-main { padding: 40px 0 64px !important; }
        }
      `}</style>

      <div className="legal-shell">
        {/* masthead — wordmark + back to home */}
        <header style={{
          position: "sticky", top: 0, zIndex: 20,
          background: DC_MASTHEAD.bg, borderBottom: `1px solid ${DC_MASTHEAD.border}`,
        }}>
          <div className="legal-wrap" style={{
            maxWidth: 1160, margin: "0 auto", padding: "0 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between", height: 56,
          }}>
            <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, background: C.accent, borderRadius: 2 }} />
              <span style={{ fontFamily: F.disp, fontWeight: 800, fontSize: 16, fontStretch: "85%", letterSpacing: "0.04em", color: DC_MASTHEAD.fg }}>
                STEELBUILD&nbsp;PRO
              </span>
            </Link>
            <Link to="/" className="legal-topbar-link">← Back to home</Link>
          </div>
        </header>

        <main className="legal-main" style={{ padding: "56px 0 80px" }}>
          <div className="legal-wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
            <span style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
              textTransform: "uppercase", color: C.accentText,
            }}>{eyebrow}</span>
            <h1 style={{
              fontFamily: F.disp, fontWeight: 800, fontSize: "clamp(34px, 6vw, 52px)", fontStretch: "85%",
              lineHeight: 1.02, letterSpacing: "-0.01em", color: C.ink, margin: "12px 0 0",
            }}>{title}</h1>
            <p style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted, margin: "14px 0 0" }}>
              Last updated: {lastUpdated}
            </p>
            <div style={{ height: 2, background: C.ink, margin: "26px 0 4px" }} />

            <div className="legal-body">{children}</div>
          </div>
        </main>

        <footer style={{ borderTop: `1px solid ${C.line2}`, background: C.surface }}>
          <div className="legal-wrap" style={{
            maxWidth: 1160, margin: "0 auto", padding: "24px 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
          }}>
            <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.muted }}>
              © {new Date().getFullYear()} SteelBuild Pro LLC
            </span>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Link to="/privacy" className="legal-footer-link">Privacy</Link>
              <Link to="/terms" className="legal-footer-link">Terms</Link>
              <Link to="/security" className="legal-footer-link">Security</Link>
              <Link to="/subprocessors" className="legal-footer-link">Subprocessors</Link>
              <Link to="/support" className="legal-footer-link">Support</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
