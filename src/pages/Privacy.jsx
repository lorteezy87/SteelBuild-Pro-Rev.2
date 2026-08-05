// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Privacy — public Privacy Policy page for steelbuild-pro.com.
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
  privacy: "privacy@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
  security: "security@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Privacy() {
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
    <LegalShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        SteelBuild Pro LLC ("SteelBuild Pro LLC," "we," "us," or "our"), the operator of
        SteelBuild Pro (the "Service"), respects your privacy. This Privacy
        Policy explains what information we collect when you use SteelBuild Pro,
        how we use and share it, and the choices you have. By using the Service
        you agree to this Policy.
      </p>

      <Section title="Information we collect">
        <p>We collect the following categories of information:</p>
        <ul style={ulStyle}>
          <li>
            <strong style={strong}>Account information.</strong> Your name,
            email address, and the workspace/organization you belong to, created
            when you register or are invited to a workspace.
          </li>
          <li>
            <strong style={strong}>Customer project data.</strong> The
            structural-steel project content you and your team put into the
            Service — drawings and submittals, RFIs, schedules, costs and budget
            data, field reports, and related documents and files you upload.
          </li>
          <li>
            <strong style={strong}>Usage telemetry.</strong> Technical and usage
            information such as log data, device and browser information, feature
            usage, and error diagnostics, which help us operate, secure, and
            improve the Service.
          </li>
          <li>
            <strong style={strong}>Payment information.</strong> Subscription and
            billing details. Card payments are processed by our payment provider,
            Stripe — <strong style={strong}>we do not collect or store your full
            card numbers</strong>.
          </li>
        </ul>
      </Section>

      <Section title="How we use your information">
        <p>We use the information we collect to:</p>
        <ul style={ulStyle}>
          <li>Provide, maintain, and secure the Service and your workspace;</li>
          <li>Authenticate users and enforce access controls;</li>
          <li>Process subscriptions, billing, and plan limits;</li>
          <li>Provide support and respond to your requests;</li>
          <li>Monitor performance, diagnose errors, and improve the Service;</li>
          <li>Comply with legal obligations and enforce our agreements.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use your
          customer project data to train third-party advertising models.
        </p>
      </Section>

      <Section title="Third parties and sub-processors">
        <p>
          We rely on a small set of trusted infrastructure providers to operate
          the Service. These sub-processors act on our behalf and are bound to
          protect your information:
        </p>
        <ul style={ulStyle}>
          <li>
            <strong style={strong}>Supabase</strong> — database, authentication,
            file storage, and hosting of our backend.
          </li>
          <li>
            <strong style={strong}>Vercel</strong> — hosting and delivery of our
            web frontend.
          </li>
          <li>
            <strong style={strong}>Stripe</strong> — subscription billing and
            payment processing.
          </li>
          <li>
            <strong style={strong}>Sentry</strong> — error monitoring and
            performance, including <em>masked</em> session replay. Replays are
            captured with all text masked and media blocked, so readable project
            or financial content is not collected.
          </li>
          <li>
            <strong style={strong}>OpenAI</strong> — AI-assisted document
            analysis (drawing revision comparison, sheet extraction, email
            classification, RFI drafting). Data sent via API is not used to train
            their models and is retained only per each provider's API data-usage
            policy.
          </li>
          <li>
            <strong style={strong}>Anthropic</strong> — AI-assisted document
            analysis (drawing revision comparison, sheet extraction, email
            classification, RFI drafting). Data sent via API is not used to train
            their models and is retained only per each provider's API data-usage
            policy.
          </li>
        </ul>
        <p>
          For a full, current list of our sub-processors — including what each
          one does, where it operates, and the region your data is stored in —
          see our <Link to="/subprocessors" style={inlineLink}>Subprocessors</Link>
          {" "}page.
        </p>
        <p>
          We may also disclose information when required by law, to protect our
          rights or the safety of others, or in connection with a corporate
          transaction such as a merger or acquisition.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          We use cookies and browser local storage for essential purposes —
          keeping you signed in, remembering your preferences, and operating the
          Service securely. We do not use third-party advertising cookies. You
          can control cookies through your browser settings, but disabling
          essential cookies may prevent the Service from working.
        </p>
      </Section>

      <Section title="Data security">
        <p>
          We protect your data with industry-standard safeguards, including
          encryption in transit (TLS) and encryption at rest. Customer data is
          isolated by tenant using Postgres row-level security enforced at the
          database boundary, so one customer's workspace cannot access another's
          data. See our <Link to="/security" style={inlineLink}>Security
          overview</Link> for more detail. No method of transmission or storage
          is completely secure, and we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="Where your data lives">
        <p>
          Your data is stored and processed in the{" "}
          <strong style={strong}>United States</strong>. Primary storage —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={strong}>us-east-1</strong> region
          (a single region). Our web frontend is hosted and delivered by Vercel
          (US), payments are processed by Stripe (US), and error monitoring runs
          on Sentry (US). AI-assisted processing is performed by US-based
          providers. We do not store customer data outside the United States, and
          we do not currently offer an EU or other regional data-residency option.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We retain account and customer project data for as long as your
          workspace is active and as needed to provide the Service. After
          account closure, we delete or anonymize data within a commercially
          reasonable period, except where we must retain certain records to
          comply with legal, tax, accounting, or contractual obligations.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Subject to applicable law, you may request access to, correction of, or
          deletion of your personal information, and you may object to or restrict
          certain processing. SteelBuild Pro also provides an in-app, per-tenant
          data export so workspace administrators can export their workspace data
          at any time. To exercise your rights, contact us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} style={inlineLink}>{CONTACT.privacy}</a>.
        </p>
      </Section>

      <Section title="Children's data">
        <p>
          SteelBuild Pro is a business tool that is not directed to children and
          is not intended for use by anyone under the age of 18. We do not
          knowingly collect personal information from children. If you believe a
          child has provided us information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we make
          material changes, we will update the "Last updated" date above and,
          where appropriate, provide additional notice. Your continued use of the
          Service after an update means you accept the revised Policy.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          Questions about this Privacy Policy or our data practices? Reach us at{" "}
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

const ulStyle = { margin: "12px 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 9 };
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
          </div>
        </div>
      </footer>
    </div>
  );
}
