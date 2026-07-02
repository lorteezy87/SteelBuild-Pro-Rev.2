// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Subprocessors — public sub-processor disclosure page for steelbuild-pro.com.
 *
 * Self-contained, standalone marketing-adjacent page. Renders WITHOUT the app
 * Layout/sidebar (it is a public page). Visually matches Landing.jsx /
 * Terms.jsx / Privacy.jsx — near-black steel base (#0B0E11), safety-gold accent,
 * Barlow Condensed display + Inter body + IBM Plex Mono labels. Default-exports a
 * single lazy-loadable component.
 *
 * Lists every third-party sub-processor that may handle customer data, what each
 * one does, where it operates, and the data-residency region. Linked from the
 * Privacy Policy's sub-processors section and the landing-page footer.
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
  privacy: "privacy@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
};

const LAST_UPDATED = "July 1, 2026";

/* The current set of sub-processors. Purpose is the reason customer data may be
   handled; Location/Region is where the provider operates + stores data. */
const SUBPROCESSORS = [
  {
    name: "Supabase",
    purpose: "Database, authentication, and file storage (our backend of record).",
    location: "United States",
    region: "AWS us-east-1",
  },
  {
    name: "Vercel",
    purpose: "Web frontend hosting and content delivery (CDN).",
    location: "United States",
    region: "US",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payment processing.",
    location: "United States",
    region: "US",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring and performance (masked session replay — text masked, media blocked).",
    location: "United States",
    region: "US",
  },
  {
    name: "OpenAI",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "US · no-training API terms",
  },
  {
    name: "Anthropic",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "US · no-training API terms",
  },
];

export default function Subprocessors() {
  // Paint html/body with the near-black steel base while mounted so the
  // scrollbar gutter and overscroll match the page; restore on unmount.
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
    <LegalShell title="Subprocessors" lastUpdated={LAST_UPDATED}>
      <p>
        SteelBuild Pro LLC ("SteelBuild Pro LLC," "we," "us," or "our"), the
        operator of SteelBuild Pro (the "Service"), relies on a small set of
        trusted third-party sub-processors to operate the Service. These
        sub-processors act on our behalf, are bound to protect your information,
        and may handle customer data only as needed to provide the Service. This
        page lists our current sub-processors, what each one does, and where it
        operates. It supplements our{" "}
        <Link to="/privacy" style={inlineLink}>Privacy Policy</Link>.
      </p>

      <Section title="Current sub-processors">
        <div style={{ overflowX: "auto", margin: "16px 0 6px" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Sub-processor</th>
                <th style={thStyle}>Purpose</th>
                <th style={thStyle}>Location / Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((sp) => (
                <tr key={sp.name}>
                  <td style={tdStyle}>
                    <strong style={strong}>{sp.name}</strong>
                  </td>
                  <td style={tdStyle}>{sp.purpose}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <div>{sp.location}</div>
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 3 }}>{sp.region}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Where your data lives">
        <p>
          Customer data is stored and processed in the{" "}
          <strong style={strong}>United States</strong>. Primary storage —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={strong}>us-east-1</strong> region
          (a single region). All other sub-processors above operate in the US. We
          do not store customer data outside the United States, and we do not
          currently offer an EU or other regional data-residency option.
        </p>
      </Section>

      <Section title="Changes to this list">
        <p>
          <strong style={strong}>
            We will update this page and notify customers before adding or
            changing a sub-processor.
          </strong>{" "}
          When we make changes, we will update the "Last updated" date above and,
          where appropriate, provide additional notice so you have an opportunity
          to review the change.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          Questions about our sub-processors or data practices? Reach us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} style={inlineLink}>{CONTACT.privacy}</a>
          {" "}(privacy) or{" "}
          <a href={`mailto:${CONTACT.support}`} style={inlineLink}>{CONTACT.support}</a>
          {" "}(general support).
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─── Shared shell + section primitives (kept local to the page) ─── */

const strong = { color: C.ink, fontWeight: 600 };
const inlineLink = { color: C.goldB, textDecoration: "none", borderBottom: `1px solid rgba(230,181,60,0.4)` };

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 14.5 };
const thStyle = {
  textAlign: "left", fontFamily: F.mono, fontSize: 11, fontWeight: 500,
  letterSpacing: "0.12em", textTransform: "uppercase", color: C.goldB,
  padding: "10px 14px", borderBottom: `1px solid ${C.line2}`, verticalAlign: "bottom",
};
const tdStyle = {
  padding: "13px 14px", borderBottom: `1px solid ${C.line}`,
  color: C.body, lineHeight: 1.6, verticalAlign: "top",
};

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
          }}>Legal</span>
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
            © {new Date().getFullYear()} SteelBuild Pro LLC
          </span>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Link to="/privacy" className="legal-topbar-link">Privacy</Link>
            <Link to="/terms" className="legal-topbar-link">Terms</Link>
            <Link to="/security" className="legal-topbar-link">Security</Link>
            <Link to="/subprocessors" className="legal-topbar-link">Subprocessors</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
