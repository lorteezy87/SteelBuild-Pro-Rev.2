// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.
/**
 * Subprocessors — public sub-processor disclosure page for steelbuild-pro.com.
 *
 * Standalone public page (renders WITHOUT the app Layout). Shell, palette and
 * type come from components/legal/LegalShell (Board Report design system).
 *
 * Lists every third-party sub-processor that may handle customer data, what each
 * one does, where it operates, and the data-residency region. Linked from the
 * Privacy Policy's sub-processors section and the landing-page footer.
 *
 * NOTE: This is conservative SaaS boilerplate, not legal advice. It must be
 * reviewed by counsel before production reliance.
 */

import React from "react";
import { Link } from "react-router-dom";
import {
  LEGAL_F, LEGAL_C, LegalShell, Section, inlineLink, strong, tableStyle, tdStyle, thStyle, useLegalPageBackground,
} from "@/components/legal/LegalShell";

const C = LEGAL_C;
const F = LEGAL_F;

const CONTACT = {
  privacy: "privacy@steelbuild-pro.com",
  support: "support@steelbuild-pro.com",
};

const LAST_UPDATED = "September 21, 2026";

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
    name: "Cloudflare",
    purpose: "Web frontend hosting, content delivery, security, and Web Analytics.",
    location: "Global network",
    region: "Processing may occur outside the US",
  },
  {
    name: "Resend",
    purpose: "Email delivery when the Resend provider is configured; recipients, message content and attachments.",
    location: "Provider infrastructure",
    region: "Subject to service configuration and terms",
  },
  {
    name: "Microsoft Graph",
    purpose: "Microsoft mailbox integration and email delivery when configured by the workspace.",
    location: "Microsoft 365 infrastructure",
    region: "Depends on the connected tenant configuration",
  },
  {
    name: "Open-Meteo",
    purpose: "Geocoding and weather forecasts using project locations or coordinates.",
    location: "Provider infrastructure",
    region: "Subject to provider service terms",
  },
  {
    name: "Google Fonts",
    purpose: "Font delivery; receives network information including IP address and browser headers.",
    location: "Global network",
    region: "Subject to Google's privacy terms",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payment processing.",
    location: "United States",
    region: "Depends on provider configuration and applicable terms",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring and performance (masked session replay — text masked, media blocked).",
    location: "United States",
    region: "Depends on provider configuration and applicable terms",
  },
  {
    name: "OpenAI",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "Depends on API service configuration and terms",
  },
  {
    name: "Anthropic",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "Depends on API service configuration and terms",
  },
];

export default function Subprocessors() {
  useLegalPageBackground();

  return (
    <LegalShell title="Subprocessors" lastUpdated={LAST_UPDATED}>
      <p>
        SteelBuild Pro LLC ("SteelBuild Pro LLC," "we," "us," or "our"), the
        operator of SteelBuild Pro (the "Service"), relies on a small set of
        third-party infrastructure and service providers to operate the Service.
        Their roles and processing locations depend on the services used and
        applicable agreements. This page lists the providers, their purposes,
        and known hosting information. It supplements our{" "}
        <Link to="/privacy" style={inlineLink}>Privacy Policy</Link>.
      </p>

      <Section title="Sub-processors and service providers">
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
          Primary storage for customer data —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={strong}>us-east-1</strong> region
          in the United States. Cloudflare and other providers use infrastructure
          that may process information in additional countries. A provider's
          headquarters does not establish its processing location. We do not
          guarantee US-only processing or offer selectable regional residency.
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
