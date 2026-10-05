import { Link } from "react-router-dom";

const SUPPORT_EMAIL = "support@steelbuild-pro.com";

const titleStyle = {
  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)",
  letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 12,
};
const linkStyle = { color: "var(--accent)", fontWeight: 600, textDecoration: "none" };

/**
 * Support and legal links for every signed-in user, in Settings → Profile.
 *
 * The privacy policy has to be easy to reach inside the iOS app (App Store
 * guideline 5.1.1). Settings → System lists these too, but that tab is
 * admin-only, so a regular member (or an App Review demo account) would
 * otherwise only see them on the sign-in screen. Router links, because the
 * native shell drops target="_blank" navigations.
 */
export default function SupportLegalSection() {
  return (
    <section
      aria-labelledby="support-legal-title"
      style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--divider)" }}
    >
      <h3 id="support-legal-title" style={{ ...titleStyle, margin: "0 0 12px" }}>Support &amp; legal</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: 12, lineHeight: 1.6 }}>
        <Link to="/support" style={linkStyle}>Help &amp; support</Link>
        <Link to="/privacy" style={linkStyle}>Privacy Policy</Link>
        <Link to="/terms" style={linkStyle}>Terms of Service</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>
      </div>
    </section>
  );
}
