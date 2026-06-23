// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Security — public Security overview page for steelbuild-pro.com.
 *
 * Self-contained, standalone marketing-adjacent page. Renders WITHOUT the app
 * Layout/sidebar (it is a public page). Visually matches Landing.jsx —
 * near-black steel base (#0B0E11), safety-gold accent, Barlow Condensed display
 * + Inter body + IBM Plex Mono labels. Default-exports a single lazy-loadable
 * component.
 *
 * NOTE: This is conservative SaaS boilerplate, not legal advice. It must be
 * reviewed by counsel before production reliance.
 */

import React, { useEffect } from "react";
import { Link } from "react-router-dom";

/* ─── Palette + fonts (self-contained, dark) — mirrors Landing.jsx ─── */

const C = {
  base: "#0B0E11", surface: "#0F141A", card: "#161C24", cardHi: "#1B232E",
  line: "rgba(255,255,255,0.07)", line2: "rgba(255,255,255,0.12)",
  ink: "#F2F4F7", body: "#AEB7C2", muted: "#727B86",
  gold: "#C89B20", goldB: "#E6B53C",
};
const F = {
  disp: "'Barlow Condensed', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

const CONTACT = {
  security: "security@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Security() {
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

  return (
    <LegalShell title="Security" lastUpdated={LAST_UPDATED}>
      <p>
        Security is foundational to SteelBuild Pro, operated by S&amp;H Steel.
        Steel fabricators and erectors trust us with sensitive project data —
        drawings, submittals, RFIs, schedules, costs, and field records — and we
        design the platform to keep that data confidential, available, and
        isolated per customer. This overview summarizes our security practices.
      </p>

      <Section title="Infrastructure">
        <p>
          SteelBuild Pro runs on industry-leading cloud infrastructure. Our web
          frontend is hosted on <strong style={strong}>Vercel</strong>, and our
          backend — database, authentication, and file storage — runs on{" "}
          <strong style={strong}>Supabase</strong>. Both providers maintain robust,
          independently audited physical and network security controls for their
          platforms.
        </p>
      </Section>

      <Section title="Encryption">
        <p>
          All data transmitted between your browser and the Service is encrypted
          in transit using <strong style={strong}>TLS</strong>. Customer data,
          including uploaded files, is <strong style={strong}>encrypted at
          rest</strong> in our database and storage layers.
        </p>
      </Section>

      <Section title="Multi-tenant isolation">
        <p>
          SteelBuild Pro is a multi-tenant platform with strict tenant separation.
          Customer data is isolated using PostgreSQL{" "}
          <strong style={strong}>row-level security (RLS)</strong> enforced at the
          database boundary — access checks are applied by the database itself, not
          only by application code. Each organization/workspace is separated so
          that one customer cannot read or modify another customer's project data.
        </p>
      </Section>

      <Section title="Authentication">
        <p>
          User authentication is handled by <strong style={strong}>Supabase
          Auth</strong>. Credentials are securely hashed, and sessions are managed
          with signed tokens. Access to project data always flows through
          authenticated, RLS-scoped requests.
        </p>
      </Section>

      <Section title="Access controls and least privilege">
        <p>
          We apply the principle of least privilege across the platform. Within a
          workspace, role-based access controls govern what each member can see and
          do. Internally, administrative access to production systems is limited to
          authorized personnel on a need-to-know basis, and service credentials are
          never exposed to the browser.
        </p>
      </Section>

      <Section title="Monitoring and error tracking">
        <p>
          We use <strong style={strong}>Sentry</strong> for error monitoring and
          performance tracking, which helps us detect and resolve issues quickly.
          Session replay is captured with <strong style={strong}>all text masked
          and media blocked</strong>, so readable project or financial content is
          never recorded in our monitoring tools.
        </p>
      </Section>

      <Section title="Backups and availability">
        <p>
          Our infrastructure providers perform regular automated backups of the
          database, and we rely on their managed redundancy and availability
          tooling to recover from failures. While no online service can guarantee
          uninterrupted availability, we design for resilience and monitor the
          platform continuously.
        </p>
      </Section>

      <Section title="Responsible disclosure">
        <p>
          We welcome reports from security researchers and customers. If you
          believe you have found a security vulnerability in SteelBuild Pro, please
          report it to{" "}
          <a href={`mailto:${CONTACT.security}`} style={inlineLink}>{CONTACT.security}</a>.
          Please give us a reasonable opportunity to investigate and remediate
          before any public disclosure, and do not access, modify, or destroy data
          that is not your own while testing. We appreciate good-faith research and
          will work with you to resolve valid issues promptly.
        </p>
      </Section>

      <Section title="Your responsibility">
        <p>
          Security is a shared responsibility. You are responsible for
          safeguarding your own account credentials, using strong and unique
          passwords, controlling who you invite to your workspace, and promptly
          reporting any suspected unauthorized access to{" "}
          <a href={`mailto:${CONTACT.support}`} style={inlineLink}>{CONTACT.support}</a>.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          For security questions or to report an issue, contact{" "}
          <a href={`mailto:${CONTACT.security}`} style={inlineLink}>{CONTACT.security}</a>.
          See also our <Link to="/privacy" style={inlineLink}>Privacy Policy</Link>
          {" "}and <Link to="/terms" style={inlineLink}>Terms of Service</Link>.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─── Shared shell + section primitives (kept local to the page) ─── */

const strong = { color: C.ink, fontWeight: 600 };
const inlineLink = { color: C.goldB, textDecoration: "none", borderBottom: `1px solid rgba(230,181,60,0.4)` };

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 38 }}>
      <h2 style={{
        fontFamily: F.disp, fontWeight: 700, fontSize: 26, letterSpacing: "0.01em",
        textTransform: "uppercase", color: C.ink, margin: "0 0 12px",
      }}>{title}</h2>
      {children}
    </section>
  );
}

function LegalShell({ title, lastUpdated, children }) {
  return (
    <div style={{ background: C.base, color: C.body, minHeight: "100vh", fontFamily: F.body, overflowX: "hidden" }}>
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

      {/* top accent edge */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldB})` }} />

      {/* top bar — wordmark + back to home */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(11,14,17,0.82)", backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${C.line}`,
      }}>
        <div className="legal-wrap" style={{
          maxWidth: 1160, margin: "0 auto", padding: "0 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
        }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: `linear-gradient(150deg, ${C.cardHi}, ${C.surface})`,
              border: `1px solid ${C.line2}`, display: "grid", placeItems: "center",
              color: C.goldB, fontFamily: F.disp, fontWeight: 700, fontSize: 14,
              letterSpacing: "0.04em", boxShadow: "0 0 18px -6px rgba(230,181,60,0.5)",
            }}>SB</div>
            <span style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 18, letterSpacing: "0.12em", color: C.ink }}>STEELBUILD&nbsp;PRO</span>
          </Link>
          <Link to="/" className="legal-topbar-link">← Back to home</Link>
        </div>
      </header>

      {/* content */}
      <main className="legal-main" style={{ padding: "60px 0 80px" }}>
        <div className="legal-wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
          <span style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.24em",
            textTransform: "uppercase", color: C.goldB,
          }}>Trust</span>
          <h1 style={{
            fontFamily: F.disp, fontWeight: 800, fontSize: "clamp(36px, 6vw, 56px)",
            lineHeight: 1.0, letterSpacing: "0.005em", textTransform: "uppercase",
            color: C.ink, margin: "14px 0 0",
          }}>{title}</h1>
          <p style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted, margin: "16px 0 0", letterSpacing: "0.04em" }}>
            Last updated: {lastUpdated}
          </p>
          <div style={{ height: 1, background: C.line, margin: "28px 0 4px" }} />

          <div className="legal-body">{children}</div>
        </div>
      </main>

      {/* minimal footer */}
      <footer style={{ borderTop: `1px solid ${C.line}`, background: C.surface }}>
        <div className="legal-wrap" style={{
          maxWidth: 1160, margin: "0 auto", padding: "26px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
        }}>
          <span style={{ fontFamily: F.mono, fontSize: 11.5, letterSpacing: "0.06em", color: C.muted }}>
            © {new Date().getFullYear()} S&amp;H Steel · SteelBuild Pro
          </span>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Link to="/privacy" className="legal-topbar-link">Privacy</Link>
            <Link to="/terms" className="legal-topbar-link">Terms</Link>
            <Link to="/security" className="legal-topbar-link">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
