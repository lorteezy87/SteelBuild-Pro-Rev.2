/**
 * Support — public help page at steelbuild-pro.com/support, and the Support
 * URL on the App Store listing.
 *
 * Renders WITHOUT the app Layout, like the legal pages, so it is reachable
 * signed out. It follows their structure (top bar, title block, footer), but
 * every color comes from the SteelBuild Dark tokens: the root carries
 * `.steelbuild-dark`, so the page is dark in either app theme, and the class's
 * aurora and grid backdrop are switched off to keep the legal pages' flat look.
 *
 * Keep it free of pricing, plan, sign-up and billing links. The iOS app is
 * sign-in only (App Review guideline 3.1.1), and the listing points here.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

const SUPPORT_EMAIL = "support@steelbuild-pro.com";
const SECURITY_EMAIL = "security@steelbuild-pro.com";
const LAST_UPDATED = "September 27, 2026";

const strong = { color: "var(--sbd-text)", fontWeight: 600 };
const inlineLink = {
  color: "var(--sbd-accent)",
  textDecoration: "none",
  borderBottom: "1px solid var(--sbd-accent-border)",
};

function Mail({ to }: { to: string }) {
  return <a href={`mailto:${to}`} style={inlineLink}>{to}</a>;
}

export default function Support() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Match the document background to the page so overscroll never flashes the
  // app theme's background, as the legal pages do. Read from the rendered root
  // so the color still comes from the token.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    const bg = getComputedStyle(root).backgroundColor;
    if (bg) {
      html.style.background = bg;
      body.style.background = bg;
    }
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="steelbuild-dark support-page"
      style={{
        background: "var(--sbd-bg-page)",
        color: "var(--sbd-text-secondary)",
        minHeight: "100vh",
        fontFamily: "var(--sbd-font-body)",
        overflowX: "hidden",
      }}
    >
      <style>{`
        .support-page.steelbuild-dark { background-image: none; }
        .support-page.steelbuild-dark::before { display: none; }
        .support-body { font-size: 15.5px; line-height: 1.75; }
        .support-body p { margin: 0 0 14px; }
        .support-body ol { margin: 0 0 14px; padding-left: 22px; list-style: decimal; }
        .support-body li::marker { color: var(--sbd-accent); }
        .support-body li { line-height: 1.7; margin-bottom: 6px; }
        .support-body a:hover { color: var(--sbd-accent-light); }
        .support-nav-link { display: inline-flex; align-items: center; color: var(--sbd-text-secondary); text-decoration: none; font-size: 14px; transition: color 0.15s; }
        .support-nav-link:hover { color: var(--sbd-accent-light); }
        @media (max-width: 620px) {
          .support-wrap { padding: 0 20px !important; }
          .support-main { padding: 40px 0 64px !important; }
        }
      `}</style>

      <div style={{ height: 3, background: "linear-gradient(90deg, var(--sbd-gold), var(--sbd-accent-light))" }} />

      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--sbd-bg-page)",
        borderBottom: "1px solid var(--sbd-border)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
        <div className="support-wrap" style={{
          maxWidth: 1160, margin: "0 auto", padding: "0 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
        }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: "var(--sbd-bg-surface-hi)",
              border: "1px solid var(--sbd-border-strong)", display: "grid", placeItems: "center",
              color: "var(--sbd-accent)", fontFamily: "var(--sbd-font-display)", fontWeight: 700, fontSize: 14,
              letterSpacing: "0.04em",
            }}>SB</div>
            <span style={{
              fontFamily: "var(--sbd-font-display)", fontWeight: 700, fontSize: 18,
              letterSpacing: "0.12em", color: "var(--sbd-text)",
            }}>STEELBUILD&nbsp;PRO</span>
          </Link>
          <Link to="/" className="support-nav-link">← Back to home</Link>
        </div>
      </header>

      <main className="support-main" style={{ padding: "60px 0 80px" }}>
        <div className="support-wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
          <span style={{
            fontFamily: "var(--sbd-font-mono)", fontSize: 11, fontWeight: 500, letterSpacing: "0.24em",
            textTransform: "uppercase", color: "var(--sbd-accent)",
          }}>Help</span>
          <h1 style={{
            fontFamily: "var(--sbd-font-display)", fontWeight: 800, fontSize: "clamp(36px, 6vw, 56px)",
            lineHeight: 1.0, letterSpacing: "0.005em", textTransform: "uppercase",
            color: "var(--sbd-text)", margin: "14px 0 0",
          }}>Support</h1>
          <p style={{
            fontFamily: "var(--sbd-font-mono)", fontSize: 12.5, color: "var(--sbd-text-muted)",
            margin: "16px 0 0", letterSpacing: "0.04em",
          }}>
            Last updated: {LAST_UPDATED}
          </p>
          <div style={{ height: 1, background: "var(--sbd-border)", margin: "28px 0 4px" }} />

          <div className="support-body">
            <Section title="Contact us">
              <p>
                Email <Mail to={SUPPORT_EMAIL} />. Tell us your workspace name, what you were doing,
                and whether you were on the web or in the iOS app. Never send us your password.
              </p>
            </Section>

            <Section title="Signing in">
              <p>
                <strong style={strong}>Forgot your password?</strong> On the sign-in screen, choose
                {" "}<strong style={strong}>Forgot password?</strong> and enter your email. The reset
                link opens in your web browser. Set a new password there, then sign in again.
              </p>
              <p>
                <strong style={strong}>New to your company&rsquo;s workspace?</strong> Your workspace
                admin invites you by email. Accept the invitation to create your login.
              </p>
            </Section>

            <Section title="Your data">
              <p>
                Workspace owners and admins can download a complete backup of every project in
                {" "}<strong style={strong}>Settings → System → Export Data</strong>.
              </p>
            </Section>

            <Section title="Deleting your account">
              <p>You can delete your account yourself, in the iOS app or on the web:</p>
              <ol>
                <li>Open <strong style={strong}>Settings → Profile</strong>.</li>
                <li>
                  Choose <strong style={strong}>Delete my account…</strong> and type your sign-in email
                  to confirm.
                </li>
              </ol>
              <p>
                Your login and profile are deleted right away, and you are signed out. Any workspace
                where you are the only member is deleted with it, including its projects, drawings,
                files and records. Workspaces you share with other people stay. The records you added
                there stay for your team.
              </p>
              <p>
                If you are the only owner of a workspace that has other members, first make one of them
                an owner on the <strong style={strong}>Team</strong> page. If you can&rsquo;t sign in,
                email <Mail to={SUPPORT_EMAIL} /> from the address on your account.
              </p>
            </Section>

            <Section title="Privacy and security">
              <p>
                Read our <Link to="/privacy" style={inlineLink}>Privacy Policy</Link>,{" "}
                <Link to="/terms" style={inlineLink}>Terms of Service</Link>,{" "}
                <Link to="/security" style={inlineLink}>Security overview</Link> and{" "}
                <Link to="/subprocessors" style={inlineLink}>Subprocessors</Link>. To report a security
                issue, email <Mail to={SECURITY_EMAIL} />.
              </p>
            </Section>
          </div>
        </div>
      </main>

      <footer style={{ borderTop: "1px solid var(--sbd-border)", background: "var(--sbd-bg-surface)" }}>
        <div className="support-wrap" style={{
          maxWidth: 1160, margin: "0 auto", padding: "26px 32px calc(26px + env(safe-area-inset-bottom, 0px))",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
        }}>
          <span style={{ fontFamily: "var(--sbd-font-mono)", fontSize: 11.5, letterSpacing: "0.06em", color: "var(--sbd-text-muted)" }}>
            © {new Date().getFullYear()} SteelBuild Pro LLC
          </span>
          <nav aria-label="Legal" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Link to="/privacy" className="support-nav-link">Privacy</Link>
            <Link to="/terms" className="support-nav-link">Terms</Link>
            <Link to="/security" className="support-nav-link">Security</Link>
            <Link to="/subprocessors" className="support-nav-link">Subprocessors</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 38 }}>
      <h2 style={{
        fontFamily: "var(--sbd-font-display)", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em",
        textTransform: "uppercase", color: "var(--sbd-text)", margin: "0 0 12px",
      }}>{title}</h2>
      {children}
    </section>
  );
}
