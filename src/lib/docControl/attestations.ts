/**
 * docControl/attestations.ts — stamp and signature state for an incoming sheet.
 *
 * Read this before changing anything here:
 *
 * A professional seal is an image and a signature is ink. Neither is reliably
 * present in a PDF's text layer. So a text layer can supply POSITIVE evidence
 * (the seal was set as live text and we found "REGISTERED PROFESSIONAL
 * ENGINEER" plus a licence number) but it can never supply negative evidence.
 * "No seal text found" means the seal was rasterised, or rotated, or simply
 * outside the page we read — it does not mean the EOR issued an unsealed sheet.
 *
 * Telling a project manager a sheet is unstamped when nobody actually looked at
 * it is a false accusation that travels straight into a transmittal and an RFI.
 * So this module returns "unverifiable", never "absent", from machine evidence.
 * Only `attestFromHuman` — somebody who looked at the sheet — can report
 * "absent", and that is the state the blocker findings key off.
 */

import type { Attestation, DocControlAttestations } from "./types";

/**
 * Seal wording that only appears inside a professional stamp. Deliberately
 * narrow: "ENGINEER" alone matches a title block's "ENGINEER OF RECORD" line on
 * every sheet ever drawn, which would report a seal on all of them.
 */
const SEAL_PATTERNS: RegExp[] = [
  /\bREGISTERED\s+PROFESSIONAL\s+ENGINEER\b/i,
  /\bLICENSED\s+PROFESSIONAL\s+ENGINEER\b/i,
  /\bPROFESSIONAL\s+ENGINEER\b/i,
  /\bSTRUCTURAL\s+ENGINEER\b\s*(?:SEAL|STAMP)/i,
  /\b(?:LIC(?:ENSE)?|REG(?:ISTRATION)?)\.?\s*(?:NO\.?|NUMBER|#)\s*[-:]?\s*[A-Z]?\d{3,}/i,
  /\bP\.?\s?E\.?\s*(?:LIC|NO|#)\b/i,
];

/** Renewal wording, corroborating but not sufficient on its own. */
const EXPIRY_PATTERN = /\b(?:EXPIRES|EXPIRATION|RENEWAL)\s*(?:DATE)?\s*[-:]?\s*\d/i;

export type AttestationSource = {
  /** True when the PDF had no text layer at all. */
  scanned: boolean;
  /** The harvested text for the sheet's page, if any was harvested. */
  pageText?: string | null;
};

/**
 * Stamp state from machine evidence only.
 *
 * Returns "present" on a confident seal-text hit, otherwise "unverifiable" —
 * never "absent". See the module header for why that asymmetry is deliberate.
 */
export function detectStamp(source: AttestationSource): Attestation {
  const text = String(source.pageText ?? "");
  if (source.scanned || !text.trim()) {
    return {
      state: "unverifiable",
      basis: "No text layer on this page — a seal can only be confirmed by looking at the sheet.",
      provenance: "not-observed",
    };
  }

  const hits = SEAL_PATTERNS.filter((re) => re.test(text));
  if (hits.length > 0) {
    const corroborated = EXPIRY_PATTERN.test(text);
    return {
      state: "present",
      basis: corroborated
        ? "Seal text found in the page text layer, with a licence expiry line."
        : "Seal text found in the page text layer.",
      provenance: "pdf-text",
    };
  }

  return {
    state: "unverifiable",
    basis:
      "No seal text in the text layer. Seals are usually raster images, so this is not evidence the sheet is unsealed — confirm visually.",
    provenance: "pdf-text",
  };
}

/**
 * Signature state from machine evidence only — always "unverifiable".
 *
 * A signature is ink over the seal. There is no text-layer signal for it at
 * all, so this function has exactly one honest answer and returns it every
 * time. It exists so the record always carries the field, and so nobody is
 * tempted to infer a signature from the presence of a seal.
 */
export function detectSignature(source: AttestationSource): Attestation {
  return {
    state: "unverifiable",
    basis: source.scanned
      ? "Image-only PDF — a signature can only be confirmed by looking at the sheet."
      : "A signature leaves no text-layer trace. Confirm visually before releasing to fabrication.",
    provenance: "not-observed",
  };
}

/**
 * Record what a person saw. This is the ONLY route to "absent" — and therefore
 * the only route to a missing-signature or missing-stamp blocker.
 */
export function attestFromHuman(state: "present" | "absent", who: string): Attestation {
  const name = String(who || "").trim();
  return {
    state,
    basis: state === "present"
      ? `Confirmed on the sheet by ${name || "reviewer"}.`
      : `Confirmed MISSING on the sheet by ${name || "reviewer"}.`,
    provenance: "human",
  };
}

/** Both attestations from one machine read. */
export function detectAttestations(source: AttestationSource): DocControlAttestations {
  return { stamp: detectStamp(source), signature: detectSignature(source) };
}
