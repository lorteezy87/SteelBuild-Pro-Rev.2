// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Privacy — public Privacy Policy page for steelbuild-pro.com.
 *
 * Standalone public page (renders WITHOUT the app Layout). Shell, palette and
 * type come from components/legal/LegalShell (Board Report design system).
 *
 * NOTE: This is conservative SaaS boilerplate, not legal advice. It must be
 * reviewed by counsel before production reliance.
 */

import React from "react";
import { Link } from "react-router-dom";
import {
  LegalShell, Section, inlineLink, strong, ulStyle, useLegalPageBackground,
} from "@/components/legal/LegalShell";

const CONTACT = {
  privacy: "privacy@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
  security: "security@steelbuild-pro.com",
};

const LAST_UPDATED = "September 21, 2026";

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
          We use the following infrastructure and service providers. The data
          shared depends on the features you use and your workspace settings:
        </p>
        <ul style={ulStyle}>
          <li>
            <strong style={strong}>Supabase</strong> — database, authentication,
            file storage, and hosting of our backend.
          </li>
          <li>
            <strong style={strong}>Cloudflare</strong> — web hosting, content
            delivery, security, and Web Analytics through its global network.
          </li>
          <li>
            <strong style={strong}>Stripe</strong> — subscription billing and
            payment processing.
          </li>
          <li>
            <strong style={strong}>Sentry</strong> — error monitoring and
            performance, including <em>masked</em> session replay. Replays are
            configured to mask text and block media. Error diagnostics and
            performance events may also contain technical context about a request.
          </li>
          <li>
            <strong style={strong}>Resend and Microsoft Graph</strong> — email
            delivery and mailbox integration where configured. Messages may
            include recipients, subjects, content, and attachments.
          </li>
          <li>
            <strong style={strong}>Open-Meteo</strong> — geocoding and weather
            forecasts using project locations or coordinates when weather
            features are used.
          </li>
          <li>
            <strong style={strong}>Google Fonts</strong> — font delivery;
            requesting fonts sends network information such as your IP address
            and browser headers to Google.
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
          Primary storage for customer data —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={strong}>us-east-1</strong> region
          in the United States. Frontend delivery uses Cloudflare's global
          network. Other providers may process information in additional
          countries under their applicable service terms and configurations.
          We do not offer a guarantee that all processing occurs in the United
          States, or a selectable regional data-residency option.
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
