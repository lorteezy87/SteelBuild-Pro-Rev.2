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

import React from "react";
import { Link } from "react-router-dom";
import {
  LegalShell,
  LegalSection,
  useLegalPageBackground,
  legalStrong,
  legalInlineLink,
} from "./legal/LegalShell";


const CONTACT = {
  security: "security@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Security() {
  useLegalPageBackground();

  return (
    <LegalShell eyebrow="Trust" title="Security" lastUpdated={LAST_UPDATED}>
      <p>
        Security is foundational to SteelBuild Pro, operated by SteelBuild Pro LLC.
        Steel fabricators and erectors trust us with sensitive project data —
        drawings, submittals, RFIs, schedules, costs, and field records — and we
        design the platform to keep that data confidential, available, and
        isolated per customer. This overview summarizes our security practices.
      </p>

      <LegalSection title="Infrastructure">
        <p>
          SteelBuild Pro runs on industry-leading cloud infrastructure. Our web
          frontend is hosted on <strong style={legalStrong}>Vercel</strong>, and our
          backend — database, authentication, and file storage — runs on{" "}
          <strong style={legalStrong}>Supabase</strong>. Both providers maintain robust,
          independently audited physical and network security controls for their
          platforms.
        </p>
      </LegalSection>

      <LegalSection title="Encryption">
        <p>
          All data transmitted between your browser and the Service is encrypted
          in transit using <strong style={legalStrong}>TLS</strong>. Customer data,
          including uploaded files, is <strong style={legalStrong}>encrypted at
          rest</strong> in our database and storage layers.
        </p>
      </LegalSection>

      <LegalSection title="Multi-tenant isolation">
        <p>
          SteelBuild Pro is a multi-tenant platform with strict tenant separation.
          Customer data is isolated using PostgreSQL{" "}
          <strong style={legalStrong}>row-level security (RLS)</strong> enforced at the
          database boundary — access checks are applied by the database itself, not
          only by application code. Each organization/workspace is separated so
          that one customer cannot read or modify another customer's project data.
        </p>
      </LegalSection>

      <LegalSection title="Where your data lives">
        <p>
          Your data is stored and processed in the{" "}
          <strong style={legalStrong}>United States</strong>. Primary storage —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={legalStrong}>us-east-1</strong> region
          (a single region). Our web frontend is hosted and delivered by Vercel
          (US), payments are processed by Stripe (US), and error monitoring runs
          on Sentry (US). AI-assisted processing is performed by US-based
          providers. We do not store customer data outside the United States, and
          we do not currently offer an EU or other regional data-residency option.
        </p>
      </LegalSection>

      <LegalSection title="Authentication">
        <p>
          User authentication is handled by <strong style={legalStrong}>Supabase
          Auth</strong>. Credentials are securely hashed, and sessions are managed
          with signed tokens. Access to project data always flows through
          authenticated, RLS-scoped requests.
        </p>
      </LegalSection>

      <LegalSection title="Access controls and least privilege">
        <p>
          We apply the principle of least privilege across the platform. Within a
          workspace, role-based access controls govern what each member can see and
          do. Internally, administrative access to production systems is limited to
          authorized personnel on a need-to-know basis, and service credentials are
          never exposed to the browser.
        </p>
      </LegalSection>

      <LegalSection title="Monitoring and error tracking">
        <p>
          We use <strong style={legalStrong}>Sentry</strong> for error monitoring and
          performance tracking, which helps us detect and resolve issues quickly.
          Session replay is captured with <strong style={legalStrong}>all text masked
          and media blocked</strong>, so readable project or financial content is
          never recorded in our monitoring tools.
        </p>
      </LegalSection>

      <LegalSection title="Backups and availability">
        <p>
          Our infrastructure providers perform regular automated backups of the
          database, and we rely on their managed redundancy and availability
          tooling to recover from failures. While no online service can guarantee
          uninterrupted availability, we design for resilience and monitor the
          platform continuously.
        </p>
      </LegalSection>

      <LegalSection title="Responsible disclosure">
        <p>
          We welcome reports from security researchers and customers. If you
          believe you have found a security vulnerability in SteelBuild Pro, please
          report it to{" "}
          <a href={`mailto:${CONTACT.security}`} style={legalInlineLink}>{CONTACT.security}</a>.
          Please give us a reasonable opportunity to investigate and remediate
          before any public disclosure, and do not access, modify, or destroy data
          that is not your own while testing. We appreciate good-faith research and
          will work with you to resolve valid issues promptly.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibility">
        <p>
          Security is a shared responsibility. You are responsible for
          safeguarding your own account credentials, using strong and unique
          passwords, controlling who you invite to your workspace, and promptly
          reporting any suspected unauthorized access to{" "}
          <a href={`mailto:${CONTACT.support}`} style={legalInlineLink}>{CONTACT.support}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          For security questions or to report an issue, contact{" "}
          <a href={`mailto:${CONTACT.security}`} style={legalInlineLink}>{CONTACT.security}</a>.
          See also our <Link to="/privacy" style={legalInlineLink}>Privacy Policy</Link>
          {" "}and <Link to="/terms" style={legalInlineLink}>Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
