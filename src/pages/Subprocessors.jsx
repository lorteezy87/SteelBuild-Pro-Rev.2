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

import React from "react";
import { Link } from "react-router-dom";
import {
  LegalShell,
  LegalSection,
  useLegalPageBackground,
  legalStrong,
  legalInlineLink,
  legalTableStyle,
  legalThStyle,
  legalTdStyle,
  LEGAL_C,
  LEGAL_F,
} from "./legal/LegalShell";
import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from "./legal/legalMeta";


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

const CONTACT = LEGAL_CONTACT;
const LAST_UPDATED = LEGAL_LAST_UPDATED.subprocessors;

export default function Subprocessors() {
  useLegalPageBackground();

  return (
    <LegalShell title="Subprocessors" lastUpdated={LAST_UPDATED} showSubprocessorsFooterLink>
      <p>
        SteelBuild Pro LLC ("SteelBuild Pro LLC," "we," "us," or "our"), the
        operator of SteelBuild Pro (the "Service"), relies on a small set of
        trusted third-party sub-processors to operate the Service. These
        sub-processors act on our behalf, are bound to protect your information,
        and may handle customer data only as needed to provide the Service. This
        page lists our current sub-processors, what each one does, and where it
        operates. It supplements our{" "}
        <Link to="/privacy" style={legalInlineLink}>Privacy Policy</Link>.
      </p>

      <LegalSection title="Current sub-processors">
        <div style={{ overflowX: "auto", margin: "16px 0 6px" }}>
          <table style={legalTableStyle}>
            <thead>
              <tr>
                <th style={legalThStyle}>Sub-processor</th>
                <th style={legalThStyle}>Purpose</th>
                <th style={legalThStyle}>Location / Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((sp) => (
                <tr key={sp.name}>
                  <td style={legalTdStyle}>
                    <strong style={legalStrong}>{sp.name}</strong>
                  </td>
                  <td style={legalTdStyle}>{sp.purpose}</td>
                  <td style={{ ...legalTdStyle, whiteSpace: "nowrap" }}>
                    <div>{sp.location}</div>
                    <div style={{ fontFamily: LEGAL_F.mono, fontSize: 12, color: LEGAL_C.muted, marginTop: 3 }}>{sp.region}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Where your data lives">
        <p>
          Customer data is stored and processed in the{" "}
          <strong style={legalStrong}>United States</strong>. Primary storage —
          database, authentication, and uploaded files — is hosted on Supabase
          running on AWS in the <strong style={legalStrong}>us-east-1</strong> region
          (a single region). All other sub-processors above operate in the US. We
          do not store customer data outside the United States, and we do not
          currently offer an EU or other regional data-residency option.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this list">
        <p>
          <strong style={legalStrong}>
            We will update this page and notify customers before adding or
            changing a sub-processor.
          </strong>{" "}
          When we make changes, we will update the "Last updated" date above and,
          where appropriate, provide additional notice so you have an opportunity
          to review the change.
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          Questions about our sub-processors or data practices? Reach us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} style={legalInlineLink}>{CONTACT.privacy}</a>
          {" "}(privacy) or{" "}
          <a href={`mailto:${CONTACT.support}`} style={legalInlineLink}>{CONTACT.support}</a>
          {" "}(general support).
        </p>
      </LegalSection>
    </LegalShell>
  );
}
