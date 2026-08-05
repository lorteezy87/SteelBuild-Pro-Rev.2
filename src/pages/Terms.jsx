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
  support: "support@steelbuild-pro.com",
  privacy: "privacy@steelbuild-pro.com",
};

const LAST_UPDATED = "June 22, 2026";

export default function Terms() {
  useLegalPageBackground();

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

      <LegalSection title="1. Acceptance of terms">
        <p>
          By accessing or using the Service, you confirm that you have read,
          understood, and agree to be bound by these Terms and our{" "}
          <Link to="/privacy" style={legalInlineLink}>Privacy Policy</Link>. If you do
          not agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts and responsibilities">
        <p>
          To use the Service you must register for an account and provide
          accurate, current information. You are responsible for safeguarding
          your login credentials and for all activity that occurs under your
          account. Notify us promptly at{" "}
          <a href={`mailto:${CONTACT.support}`} style={legalInlineLink}>{CONTACT.support}</a>
          {" "}if you suspect unauthorized use. You must be at least 18 years old
          to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul style={legalUlStyle}>
          <li>Use the Service for any unlawful, infringing, or fraudulent purpose;</li>
          <li>Attempt to access, alter, or interfere with another tenant's workspace or data;</li>
          <li>Probe, scan, or attempt to breach the security or authentication of the Service;</li>
          <li>Reverse engineer, decompile, or disrupt the Service or its infrastructure;</li>
          <li>Upload malware, or content that is unlawful or violates the rights of others.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Subscriptions and billing">
        <p>
          Paid plans are billed through our payment processor, Stripe. By
          subscribing, you authorize recurring charges for the applicable plan.
          Subscriptions <strong style={legalStrong}>renew automatically</strong> at the
          end of each billing period unless cancelled beforehand. Plan limits are
          enforced by the Service. You may cancel at any time from your billing
          settings; cancellation takes effect at the end of the current billing
          period, and fees already paid are non-refundable except where required
          by law.
        </p>
      </LegalSection>

      <LegalSection title="5. Customer data ownership">
        <p>
          As between you and us, <strong style={legalStrong}>you own your customer
          project data</strong> — the drawings, submittals, RFIs, schedules,
          costs, field reports, and other content you put into the Service. You
          grant us a limited license to host, process, and transmit that data
          solely to provide and support the Service. We do not claim ownership of
          your project data.
        </p>
      </LegalSection>

      <LegalSection title="6. Intellectual property">
        <p>
          The Service, including its software, design, trademarks, and all related
          intellectual property, is and remains the exclusive property of
          SteelBuild Pro LLC and its licensors. These Terms do not grant you any right to our
          intellectual property except the limited right to use the Service as
          permitted here.
        </p>
      </LegalSection>

      <LegalSection title="7. Disclaimer of warranties">
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
          <strong style={legalStrong}>
            We do not warrant that any output is accurate, complete, current, or
            suitable for any construction, fabrication, erection, contractual, or
            financial decision.
          </strong>{" "}
          All outputs are informational aids only and do not constitute
          engineering, financial, legal, or professional advice.
        </p>
      </LegalSection>

      <LegalSection title="8. Customer responsibility">
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
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
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
      </LegalSection>

      <LegalSection title="10. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless SteelBuild Pro LLC and its
          members, officers, employees, and agents from and against any claims,
          damages, liabilities, losses, costs, and expenses (including reasonable
          attorneys' fees) arising out of or relating to (a) your use of the
          Service, (b) your reliance on any output of the Service, (c) your
          violation of these Terms, or (d) your violation of any contract, law, or
          third-party right.
        </p>
      </LegalSection>

      <LegalSection title="11. Termination">
        <p>
          You may stop using the Service and close your account at any time. We
          may suspend or terminate your access if you breach these Terms, fail to
          pay applicable fees, or use the Service in a way that risks harm to
          others or to the Service. Upon termination, your right to use the
          Service ceases; sections that by their nature should survive (including
          ownership, disclaimers, limitation of liability, and indemnification)
          will survive.
        </p>
      </LegalSection>

      <LegalSection title="12. Governing law">
        <p>
          These Terms are governed by the laws of the State of Arizona, USA,
          without regard to its conflict-of-laws principles. You agree to the
          exclusive jurisdiction of the state and federal courts located in
          Arizona for any dispute arising out of or relating to these Terms or the
          Service.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to these terms">
        <p>
          We may update these Terms from time to time. When we make material
          changes, we will update the "Last updated" date above and, where
          appropriate, provide additional notice. Your continued use of the
          Service after an update means you accept the revised Terms.
        </p>
      </LegalSection>

      <LegalSection title="14. Contact us">
        <p>
          Questions about these Terms? Reach us at{" "}
          <a href={`mailto:${CONTACT.support}`} style={legalInlineLink}>{CONTACT.support}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
