// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Terms — public Terms of Service page for steelbuild-pro.com.
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
  support: "support@steelbuild-pro.com",
  privacy: "privacy@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Terms() {
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
    <LegalShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service ("Terms") govern your access to and use of
        SteelBuild Pro (the "Service"), operated by SteelBuild Pro LLC
        ("SteelBuild Pro LLC," "we," "us," or "our"). By creating an account or using the
        Service, you agree to these Terms. If you are using the Service on behalf
        of an organization, you represent that you are authorized to bind that
        organization to these Terms.
      </p>

      <Section title="1. Acceptance of terms">
        <p>
          By accessing or using the Service, you confirm that you have read,
          understood, and agree to be bound by these Terms and our{" "}
          <Link to="/privacy" style={inlineLink}>Privacy Policy</Link>. If you do
          not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. Accounts and responsibilities">
        <p>
          To use the Service you must register for an account and provide
          accurate, current information. You are responsible for safeguarding
          your login credentials and for all activity that occurs under your
          account. Notify us promptly at{" "}
          <a href={`mailto:${CONTACT.support}`} style={inlineLink}>{CONTACT.support}</a>
          {" "}if you suspect unauthorized use. You must be at least 18 years old
          to use the Service.
        </p>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul style={ulStyle}>
          <li>Use the Service for any unlawful, infringing, or fraudulent purpose;</li>
          <li>Attempt to access, alter, or interfere with another tenant's workspace or data;</li>
          <li>Probe, scan, or attempt to breach the security or authentication of the Service;</li>
          <li>Reverse engineer, decompile, or disrupt the Service or its infrastructure;</li>
          <li>Upload malware, or content that is unlawful or violates the rights of others.</li>
        </ul>
      </Section>

      <Section title="4. Subscriptions and billing">
        <p>
          Paid plans are billed through our payment processor, Stripe. By
          subscribing, you authorize recurring charges for the applicable plan.
          Subscriptions <strong style={strong}>renew automatically</strong> at the
          end of each billing period unless cancelled beforehand. Plan limits are
          enforced by the Service. You may cancel at any time from your billing
          settings; cancellation takes effect at the end of the current billing
          period, and fees already paid are non-refundable except where required
          by law.
        </p>
      </Section>

      <Section title="5. Customer data ownership">
        <p>
          As between you and us, <strong style={strong}>you own your customer
          project data</strong> — the drawings, submittals, RFIs, schedules,
          costs, field reports, and other content you put into the Service. You
          grant us a limited license to host, process, and transmit that data
          solely to provide and support the Service. We do not claim ownership of
          your project data.
        </p>
      </Section>

      <Section title="6. Intellectual property">
        <p>
          The Service, including its software, design, trademarks, and all related
          intellectual property, is and remains the exclusive property of
          SteelBuild Pro LLC and its licensors. These Terms do not grant you any right to our
          intellectual property except the limited right to use the Service as
          permitted here.
        </p>
      </Section>

      <Section title="7. Disclaimer of warranties">
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES
          OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. SteelBuild Pro LLC
          expressly disclaims all implied warranties of merchantability, fitness
          for a particular purpose, title, and non-infringement.
        </p>
        <p>
          The Service includes tools that generate, calculate, organize, and
          surface project data — including but not limited to fabrication release
          determinations, RFI and submittal tracking, schedule outputs, pay
          application figures (including G702/G703 calculations), change order and
          backcharge records, and AI-generated content.{" "}
          <strong style={strong}>
            We do not warrant that any output is accurate, complete, current, or
            suitable for any construction, fabrication, erection, contractual, or
            financial decision.
          </strong>{" "}
          All outputs are informational aids only and do not constitute
          engineering, financial, legal, or professional advice.
        </p>
      </Section>

      <Section title="8. Customer responsibility">
        <p>
          You are solely responsible for independently verifying all data,
          calculations, and outputs of the Service before relying on them. You
          retain full responsibility for all project, fabrication, erection,
          scheduling, billing, and contractual decisions. The Service does not
          replace the professional judgment of licensed engineers, the review of
          the engineer of record, or the obligations of any party under your
          contracts. We are not a party to, and assume no responsibility for, your
          contracts with general contractors, owners, architects, engineers, or
          any third party.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL STEELBUILD PRO LLC,
          ITS MEMBERS, OFFICERS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, OR
          FOR ANY LOSS OF PROFITS, REVENUE, DATA, BUSINESS, GOODWILL, PROJECT
          SCHEDULE, OR ANTICIPATED SAVINGS, ARISING OUT OF OR RELATING TO THE
          SERVICE, WHETHER BASED IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT
          LIABILITY, OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
          DAMAGES.
        </p>
        <p>
          Our total aggregate liability for all claims arising out of or relating
          to the Service shall not exceed the total fees actually paid by you to
          us in the twelve (12) months immediately preceding the event giving rise
          to the claim.
        </p>
        <p>
          Some jurisdictions do not allow the exclusion or limitation of certain
          damages, so portions of the above may not apply to you.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless SteelBuild Pro LLC and its
          members, officers, employees, and agents from and against any claims,
          damages, liabilities, losses, costs, and expenses (including reasonable
          attorneys' fees) arising out of or relating to (a) your use of the
          Service, (b) your reliance on any output of the Service, (c) your
          violation of these Terms, or (d) your violation of any contract, law, or
          third-party right.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          You may stop using the Service and close your account at any time. We
          may suspend or terminate your access if you breach these Terms, fail to
          pay applicable fees, or use the Service in a way that risks harm to
          others or to the Service. Upon termination, your right to use the
          Service ceases; sections that by their nature should survive (including
          ownership, disclaimers, limitation of liability, and indemnification)
          will survive.
        </p>
      </Section>

      <Section title="12. Governing law">
        <p>
          These Terms are governed by the laws of the State of Arizona, USA,
          without regard to its conflict-of-laws principles. You agree to the
          exclusive jurisdiction of the state and federal courts located in
          Arizona for any dispute arising out of or relating to these Terms or the
          Service.
        </p>
      </Section>

      <Section title="13. Changes to these terms">
        <p>
          We may update these Terms from time to time. When we make material
          changes, we will update the "Last updated" date above and, where
          appropriate, provide additional notice. Your continued use of the
          Service after an update means you accept the revised Terms.
        </p>
      </Section>

      <Section title="14. Contact us">
        <p>
          Questions about these Terms? Reach us at{" "}
          <a href={`mailto:${CONTACT.support}`} style={inlineLink}>{CONTACT.support}</a>.
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
