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

import React from "react";
import { Link } from "react-router-dom";
import {
  LegalShell,
  LegalSection,
  useLegalPageBackground,
  legalUlStyle,
  legalStrong,
  legalInlineLink,
} from "./legal/LegalShell";


const CONTACT = {
  privacy: "privacy@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
  security: "security@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Privacy() {
  useLegalPageBackground();

  return (
    <LegalShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        SteelBuild Pro LLC ("SteelBuild Pro LLC," "we," "us," or "our"), the operator of
        SteelBuild Pro (the "Service"), respects your privacy. This Privacy
        Policy explains what information we collect when you use SteelBuild Pro,
        how we use and share it, and the choices you have. By using the Service
        you agree to this Policy.
      </p>

      <LegalSection title="Information we collect">
        <p>We collect the following categories of information:</p>
        <ul style={legalUlStyle}>
          <li>
            <strong style={legalStrong}>Account information.</strong> Your name,
            email address, and the workspace/organization you belong to, created
            when you register or are invited to a workspace.
          </li>
          <li>
            <strong style={legalStrong}>Customer project data.</strong> The
            structural-steel project content you and your team put into the
            Service — drawings and submittals, RFIs, schedules, costs and budget
            data, field reports, and related documents and files you upload.
          </li>
          <li>
            <strong style={legalStrong}>Usage telemetry.</strong> Technical and usage
            information such as log data, device and browser information, feature
            usage, and error diagnostics, which help us operate, secure, and
            improve the Service.
          </li>
          <li>
            <strong style={legalStrong}>Payment information.</strong> Subscription and
            billing details. Card payments are processed by our payment provider,
            Stripe — <strong style={legalStrong}>we do not collect or store your full
            card numbers</strong>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use your information">
        <p>We use the information we collect to:</p>
        <ul style={legalUlStyle}>
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
      </LegalSection>

      <LegalSection title="Third parties and sub-processors">
        <p>
          We rely on a small set of trusted infrastructure providers to operate
          the Service. These sub-processors act on our behalf and are bound to
          protect your information:
        </p>
        <ul style={legalUlStyle}>
          <li>
            <strong style={legalStrong}>Supabase</strong> — database, authentication,
            file storage, and hosting of our backend.
          </li>
          <li>
            <strong style={legalStrong}>Vercel</strong> — hosting and delivery of our
            web frontend.
          </li>
          <li>
            <strong style={legalStrong}>Stripe</strong> — subscription billing and
            payment processing.
          </li>
          <li>
            <strong style={legalStrong}>Sentry</strong> — error monitoring and
            performance, including <em>masked</em> session replay. Replays are
            captured with all text masked and media blocked, so readable project
            or financial content is not collected.
          </li>
          <li>
            <strong style={legalStrong}>OpenAI</strong> — AI-assisted document
            analysis (drawing revision comparison, sheet extraction, email
            classification, RFI drafting). Data sent via API is not used to train
            their models and is retained only per each provider's API data-usage
            policy.
          </li>
          <li>
            <strong style={legalStrong}>Anthropic</strong> — AI-assisted document
            analysis (drawing revision comparison, sheet extraction, email
            classification, RFI drafting). Data sent via API is not used to train
            their models and is retained only per each provider's API data-usage
            policy.
          </li>
        </ul>
        <p>
          For a full, current list of our sub-processors — including what each
          one does, where it operates, and the region your data is stored in —
          see our <Link to="/subprocessors" style={legalInlineLink}>Subprocessors</Link>
          {" "}page.
        </p>
        <p>
          We may also disclose information when required by law, to protect our
          rights or the safety of others, or in connection with a corporate
          transaction such as a merger or acquisition.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We use cookies and browser local storage for essential purposes —
          keeping you signed in, remembering your preferences, and operating the
          Service securely. We do not use third-party advertising cookies. You
          can control cookies through your browser settings, but disabling
          essential cookies may prevent the Service from working.
        </p>
      </LegalSection>

      <LegalSection title="Data security">
        <p>
          We protect your data with industry-standard safeguards, including
          encryption in transit (TLS) and encryption at rest. Customer data is
          isolated by tenant using Postgres row-level security enforced at the
          database boundary, so one customer's workspace cannot access another's
          data. See our <Link to="/security" style={legalInlineLink}>Security
          overview</Link> for more detail. No method of transmission or storage
          is completely secure, and we cannot guarantee absolute security.
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

      <LegalSection title="Data retention">
        <p>
          We retain account and customer project data for as long as your
          workspace is active and as needed to provide the Service. After
          account closure, we delete or anonymize data within a commercially
          reasonable period, except where we must retain certain records to
          comply with legal, tax, accounting, or contractual obligations.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Subject to applicable law, you may request access to, correction of, or
          deletion of your personal information, and you may object to or restrict
          certain processing. SteelBuild Pro also provides an in-app, per-tenant
          data export so workspace administrators can export their workspace data
          at any time. To exercise your rights, contact us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} style={legalInlineLink}>{CONTACT.privacy}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Children's data">
        <p>
          SteelBuild Pro is a business tool that is not directed to children and
          is not intended for use by anyone under the age of 18. We do not
          knowingly collect personal information from children. If you believe a
          child has provided us information, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we make
          material changes, we will update the "Last updated" date above and,
          where appropriate, provide additional notice. Your continued use of the
          Service after an update means you accept the revised Policy.
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          Questions about this Privacy Policy or our data practices? Reach us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} style={legalInlineLink}>{CONTACT.privacy}</a>
          {" "}(privacy) or{" "}
          <a href={`mailto:${CONTACT.support}`} style={legalInlineLink}>{CONTACT.support}</a>
          {" "}(general support).
        </p>
      </LegalSection>
    </LegalShell>
  );
}
