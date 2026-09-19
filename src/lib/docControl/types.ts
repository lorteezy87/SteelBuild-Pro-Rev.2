/**
 * docControl/types.ts — the typed contracts for Document Control intake.
 *
 * Incoming construction documents (drawing sheets, spec pages, RFI responses)
 * get read once, into ONE record shape, so every downstream consumer — the
 * intake UI, the register cross-reference, the ingestion payload — argues from
 * the same facts.
 *
 * The single most important idea in this file is the difference between
 * "we looked and the field was not there" and "we never looked". A NULL that
 * conflates the two is how a document-control system tells a PM a sheet is
 * unstamped when in truth nobody ever checked. Every extracted value therefore
 * carries `observed`; see `DocField`.
 */

/** Where a value came from. Drives how much trust a reader can place in it. */
export type FieldProvenance =
  /** Read from the drawing set's marked titleblock rectangle — highest trust. */
  | "titleblock-rect"
  /** Parsed out of the PDF text layer by the extractor. */
  | "pdf-text"
  /** Carried from the existing `drawing_sets` row. */
  | "drawing-set"
  /** Carried from the existing `drawings` row. */
  | "drawing-row"
  /** Typed or confirmed by a person. */
  | "human"
  /** Nothing inspected this field. The value is UNKNOWN, not absent. */
  | "not-observed";

/**
 * One extracted title-block value.
 *
 * `observed: false` means no source was inspected for this field — a null
 * `value` then proves nothing and MUST NOT be rendered as an affirmative
 * negative or written to the database.
 *
 * `observed: true` with `value: null` is the real finding: we read the source
 * and the field was not stated. That one is worth flagging to the GC.
 */
export type DocField = {
  value: string | null;
  provenance: FieldProvenance;
  observed: boolean;
};

/**
 * The five title-block facts Document Control runs on.
 * Every one of them is a `DocField` — none of them is ever a bare string,
 * because a bare string cannot express "not checked".
 */
export type DocControlTitleBlock = {
  projectName: DocField;
  sheetNumber: DocField;
  revisionNumber: DocField;
  issueDate: DocField;
  authorizingEngineer: DocField;
};

/**
 * Stamp / signature state.
 *
 * "absent" is only ever reachable from a source that could have shown the mark
 * — in practice, a person looking at the sheet. A PDF text layer cannot prove
 * a wet signature or an embossed seal is missing, only that no seal TEXT was
 * found, so text-layer evidence yields "present" or "unverifiable" and never
 * "absent". Reporting "missing signature" off a text layer is a false
 * accusation against the EOR; reporting "unverifiable" is the truth.
 */
export type AttestationState = "present" | "absent" | "unverifiable";

export type Attestation = {
  state: AttestationState;
  /** Plain-language reason, shown verbatim in the UI and the payload. */
  basis: string;
  provenance: FieldProvenance;
};

export type DocControlAttestations = {
  /** Professional seal / P.E. stamp. */
  stamp: Attestation;
  /** Signature over the seal. */
  signature: Attestation;
};

/** How the incoming sheet number relates to the Master Document Register. */
export type RegisterStatus =
  /** Exactly one live register entry with this exact sheet number. */
  | "revision-of-record"
  /** No register entry carries this number — a genuinely new sheet. */
  | "new-to-register"
  /** More than one live entry shares the number — never auto-paired. */
  | "duplicate-in-register"
  /** The incoming document carries no usable sheet number. */
  | "unidentified"
  /**
   * The register rows handed in were capped by the row limit, so a miss proves
   * nothing — the matching sheet may simply be past the cap. Never reported as
   * "new".
   */
  | "register-incomplete";

/** One live row of the Master Document Register (a `drawings` row). */
export type MdrEntry = {
  id: string | null;
  sheetNumber: string | null;
  title: string | null;
  revisionNumber: string | null;
  drawingSetName: string | null;
  stage: string | null;
  isSuperseded: boolean | null;
  /** Detected cross-sheet callouts, as stored on `drawings.callouts`. */
  callouts: CalloutRef[];
  /** Text layer harvested at upload, as stored on `drawings.extracted_text`. */
  extractedText: string | null;
};

/** A detected cross-sheet reference. Mirrors the `drawings.callouts` element. */
export type CalloutRef = {
  targetSheetNumber: string | null;
  text: string | null;
};

export type RegisterCrossReference = {
  status: RegisterStatus;
  /** The single matched live entry, or null for every other status. */
  matched: MdrEntry | null;
  /** Every live entry sharing the number — populated on a duplicate. */
  candidates: MdrEntry[];
  /** Human-readable reason, always set. */
  note: string;
};

/** Which bucket of the drawing a change landed in. */
export type ChangeChannel = "text" | "line-work" | "callouts" | "metadata";

export type ChangeBullet = {
  channel: ChangeChannel;
  /** Rendered as a bullet, verbatim. */
  text: string;
  /**
   * False when the channel cannot be compared from the sources at hand — the
   * bullet then states the limit instead of asserting "no change".
   */
  comparable: boolean;
};

export type ChangeSummary = {
  /** Sheet number + revision this was compared against, or null if nothing to compare. */
  comparedAgainst: string | null;
  bullets: ChangeBullet[];
};

export type FindingSeverity = "blocker" | "warning" | "info";

export type DocControlFindingCode =
  | "missing-project-name"
  | "missing-sheet-number"
  | "missing-revision"
  | "missing-issue-date"
  | "missing-authorizing-engineer"
  | "unverified-stamp"
  | "unverified-signature"
  | "absent-stamp"
  | "absent-signature"
  | "unapproved-revision"
  | "duplicate-sheet-number"
  | "revision-not-advanced"
  | "new-to-register"
  | "register-incomplete"
  | "not-inspected";

export type DocControlFinding = {
  code: DocControlFindingCode;
  severity: FindingSeverity;
  message: string;
  sheetNumber: string | null;
};

/**
 * What intake should do with the document.
 * `hold` whenever any blocker finding is present — never silently accept.
 */
export type DocControlDisposition = "accept" | "hold";

/** The database-ready half of the record. */
export type DocControlIngest = {
  table: "drawings";
  operation: "insert" | "update";
  /** `{ id }` on an update; the natural key on an insert. */
  match: Record<string, string>;
  /**
   * Column values to write. Only ever carries OBSERVED, non-null fields —
   * an unknown is omitted so ingestion cannot overwrite a real value with a
   * guess, nor persist "unknown" as an affirmative blank.
   */
  values: Record<string, string>;
  /** Columns deliberately withheld, with the reason. Surfaced, not hidden. */
  withheld: Array<{ column: string; reason: string }>;
};

/** The complete Document Control record — the object intake emits. */
export type DocControlRecord = {
  schemaVersion: "doc-control/1";
  generatedAt: string;
  projectId: string | null;
  titleBlock: DocControlTitleBlock;
  attestations: DocControlAttestations;
  register: RegisterCrossReference;
  changeSummary: ChangeSummary;
  findings: DocControlFinding[];
  disposition: DocControlDisposition;
  ingest: DocControlIngest;
};
