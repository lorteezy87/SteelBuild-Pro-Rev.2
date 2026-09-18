/**
 * docControl/findings.ts — the flags an intake review must not swallow.
 *
 * Severity means one thing here and one thing only:
 *
 *   blocker — the document cannot be ingested into the register safely. Either
 *             it cannot be placed (no sheet number, duplicate number) or a
 *             person has positively confirmed the seal or signature is missing.
 *   warning — ingest it, but somebody must look before this sheet drives steel.
 *   info    — worth recording, no action.
 *
 * A deliberate line: an UNVERIFIED seal or signature is a warning, not a
 * blocker. Text-layer evidence can never prove a seal absent (see
 * attestations.ts), so blocking on "unverified" would block every document
 * this system ever sees and the flag would be trained out within a week. What
 * blocks is a HUMAN confirming the mark is missing.
 *
 * Second deliberate line: these findings govern INTAKE — logging the document
 * into the register. They are not the fabrication release gate. Release stays
 * with `src/lib/fabReleaseGate.ts`; an accepted intake never means "build it".
 *
 * Pure. No React, no Supabase.
 */

import type {
  DocControlAttestations,
  DocControlFinding,
  DocControlTitleBlock,
  RegisterCrossReference,
} from "./types";

/**
 * Issuance codes that release steel. Everything else — IFA, OFA, BFA, OFS,
 * bid sets, letter revisions — is a review issuance and must not reach the
 * shop floor. Mirrors the canonical stage ladder in `drawingEnums.ts`.
 */
const APPROVED_ISSUANCES = new Set(["IFC", "RELEASED", "FINAL IFC"]);

/** Explicit do-not-build markings that sometimes ride in the revision box. */
const NOT_FOR_CONSTRUCTION = /\b(?:NOT\s+FOR\s+CONSTRUCTION|PRELIMINARY|VOID|SUPERSEDED|DRAFT)\b/i;

/** True when a revision code is an approved-for-construction issuance. */
export function isApprovedIssuance(revisionCode: string | null | undefined): boolean {
  const code = String(revisionCode ?? "").trim().toUpperCase();
  if (!code) return false;
  if (NOT_FOR_CONSTRUCTION.test(code)) return false;
  if (APPROVED_ISSUANCES.has(code)) return true;
  // "IFC Rev 2", "IFC REV 3 — ADDENDUM 1" — still an IFC issuance.
  return /^IFC\b/.test(code);
}

export type FindingsInput = {
  titleBlock: DocControlTitleBlock;
  attestations: DocControlAttestations;
  register: RegisterCrossReference;
};

/**
 * Compute every finding for one document.
 *
 * Ordered blockers first, then warnings, then info, so the first thing a
 * reviewer reads is the thing that stops the job.
 */
export function computeDocControlFindings(input: FindingsInput): DocControlFinding[] {
  const { titleBlock, attestations, register } = input;
  const sheetNumber = titleBlock.sheetNumber.value;
  const out: DocControlFinding[] = [];

  const push = (
    code: DocControlFinding["code"],
    severity: DocControlFinding["severity"],
    message: string,
  ) => out.push({ code, severity, message, sheetNumber });

  // ── Placement ──────────────────────────────────────────────────────
  if (register.status === "unidentified") {
    push(
      "missing-sheet-number",
      "blocker",
      titleBlock.sheetNumber.observed
        ? "The title block does not state a sheet number — the document cannot be placed in the register."
        : "No sheet number was extracted and nothing was inspected for one — key it in before ingesting.",
    );
  }
  if (register.status === "duplicate-in-register") {
    push("duplicate-sheet-number", "blocker", register.note);
  }

  // ── Attestations ───────────────────────────────────────────────────
  if (attestations.stamp.state === "absent") {
    push("absent-stamp", "blocker", `Professional seal confirmed missing. ${attestations.stamp.basis}`);
  } else if (attestations.stamp.state === "unverifiable") {
    push("unverified-stamp", "warning", `Seal not verified. ${attestations.stamp.basis}`);
  }

  if (attestations.signature.state === "absent") {
    push("absent-signature", "blocker", `Signature confirmed missing. ${attestations.signature.basis}`);
  } else if (attestations.signature.state === "unverifiable") {
    push("unverified-signature", "warning", `Signature not verified. ${attestations.signature.basis}`);
  }

  // ── Revision status ────────────────────────────────────────────────
  const revision = titleBlock.revisionNumber;
  if (revision.observed && revision.value === null) {
    push("missing-revision", "warning", "The title block does not state a revision — the shop cannot tell which issue this is.");
  } else if (!revision.observed) {
    push("not-inspected", "warning", "Revision was not inspected on this document. Unknown, not blank — confirm before ingesting.");
  } else if (!isApprovedIssuance(revision.value)) {
    push(
      "unapproved-revision",
      "warning",
      `Revision "${revision.value}" is a review issuance, not an approved-for-construction one. Log it, but do not release it to the shop.`,
    );
  }

  if (
    register.status === "revision-of-record" &&
    register.matched &&
    revision.value !== null &&
    norm(register.matched.revisionNumber) === norm(revision.value)
  ) {
    push(
      "revision-not-advanced",
      "warning",
      `Incoming revision "${revision.value}" matches the sheet of record. Two documents now claim the same revision — confirm which one is current before anyone builds from it.`,
    );
  }

  // ── Remaining title-block fields ───────────────────────────────────
  fieldFinding(out, sheetNumber, titleBlock.projectName, "missing-project-name", "project name");
  fieldFinding(out, sheetNumber, titleBlock.issueDate, "missing-issue-date", "issue date");
  fieldFinding(
    out,
    sheetNumber,
    titleBlock.authorizingEngineer,
    "missing-authorizing-engineer",
    "authorizing engineer",
  );

  // ── Register context ───────────────────────────────────────────────
  if (register.status === "new-to-register") {
    push("new-to-register", "info", register.note);
  }
  if (register.status === "register-incomplete") {
    push("register-incomplete", "warning", register.note);
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

const SEVERITY_RANK: Record<DocControlFinding["severity"], number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

/**
 * One field's finding. Distinguishes "we read the box and it was empty" from
 * "nobody read the box" — the two need different words and different actions.
 */
function fieldFinding(
  out: DocControlFinding[],
  sheetNumber: string | null,
  field: DocControlTitleBlock[keyof DocControlTitleBlock],
  code: DocControlFinding["code"],
  label: string,
): void {
  if (field.value !== null) return;
  if (field.observed) {
    out.push({
      code,
      severity: "warning",
      message: `The title block does not state the ${label}.`,
      sheetNumber,
    });
  } else {
    out.push({
      code: "not-inspected",
      severity: "warning",
      message: `The ${label} was not inspected on this document — unknown, not blank.`,
      sheetNumber,
    });
  }
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

/** True when any finding blocks ingestion. */
export function hasBlocker(findings: DocControlFinding[]): boolean {
  return (findings || []).some((f) => f?.severity === "blocker");
}
