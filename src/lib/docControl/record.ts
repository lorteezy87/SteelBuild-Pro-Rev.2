/**
 * docControl/record.ts — compose one document's intake into the single record
 * the UI renders and the database ingests.
 *
 * This is the deterministic boundary for Document Control, in the same spirit
 * as `pccEngine.ts` for Production Control: one typed input, one typed output,
 * no React, no Supabase, no hidden clock. Callers fetch; this decides.
 *
 * The ingestion half is deliberately conservative. `ingest.values` carries ONLY
 * fields that were observed AND have a value, and only for columns that
 * actually exist on `drawings`. Everything else lands in `ingest.withheld`
 * with the reason, because the failure mode that matters is not a missing
 * column — it is an "unknown" written into the register as a confident blank
 * and read six weeks later as fact.
 */

import { readTitleBlock, type TitleBlockSource } from "./titleBlock";
import { detectAttestations, type AttestationSource } from "./attestations";
import { crossReferenceRegister } from "./mdr";
import { buildChangeSummary, type IncomingSheet } from "./changeSummary";
import { computeDocControlFindings, hasBlocker } from "./findings";
import type {
  DocControlAttestations,
  DocControlIngest,
  DocControlRecord,
  DocControlTitleBlock,
  MdrEntry,
  RegisterCrossReference,
} from "./types";

export type BuildRecordInput = {
  projectId: string | null;
  /** What the extractor saw, for the five title-block fields. */
  titleBlock: TitleBlockSource;
  /** Text evidence for seal detection. */
  attestationSource: AttestationSource;
  /**
   * Overrides from a person who looked at the sheet. Supplied by the intake UI
   * once a reviewer attests; this is the only route to an "absent" mark.
   */
  attestationOverrides?: Partial<DocControlAttestations>;
  /** Live register rows for the project. Omit only when passing `registerOverride`. */
  register?: MdrEntry[];
  /**
   * False when the register read hit the row cap. Compare the returned row
   * count against `EFFECTIVE_LIST_CAP` — not `LIST_ROW_CAP`, which is only what
   * the request asked for and can never fire.
   *
   * Defaults to FALSE when omitted: an unstated completeness must never let the
   * engine announce a sheet is new to the register.
   */
  registerComplete?: boolean;
  /**
   * A cross-reference already computed by the caller.
   *
   * Used by the revision-upload wizard, whose register scope is the drawing set
   * it already diffed — re-matching against a different row set there would
   * silently change what "in the register" means mid-flow.
   */
  registerOverride?: RegisterCrossReference;
  /** The incoming sheet's own content, for the change summary. */
  incoming: {
    title?: string | null;
    extractedText?: string | null;
    callouts?: IncomingSheet["callouts"];
  };
  /** Injectable clock. Tests pass a fixed value; production omits it. */
  now?: Date;
};

/** Build the complete Document Control record for one incoming document. */
export function buildDocControlRecord(input: BuildRecordInput): DocControlRecord {
  const titleBlock = readTitleBlock(input.titleBlock);

  const attestations: DocControlAttestations = {
    ...detectAttestations(input.attestationSource),
    ...(input.attestationOverrides ?? {}),
  };

  const register =
    input.registerOverride ??
    crossReferenceRegister({
      sheetNumber: titleBlock.sheetNumber.value,
      register: input.register ?? [],
      registerComplete: input.registerComplete === true,
    });

  const incoming: IncomingSheet = {
    sheetNumber: titleBlock.sheetNumber.value,
    title: input.incoming.title ?? null,
    revisionNumber: titleBlock.revisionNumber.value,
    issueDate: titleBlock.issueDate.value,
    extractedText: input.incoming.extractedText ?? null,
    callouts: input.incoming.callouts ?? [],
    scanned: input.titleBlock.scanned,
  };

  const changeSummary = buildChangeSummary(incoming, register.matched);
  const findings = computeDocControlFindings({ titleBlock, attestations, register });

  return {
    schemaVersion: "doc-control/1",
    generatedAt: (input.now ?? new Date()).toISOString(),
    projectId: input.projectId ?? null,
    titleBlock,
    attestations,
    register,
    changeSummary,
    findings,
    // Blockers hold the document. Warnings do not — they travel with it, and
    // the fabrication release gate is where they have to be cleared.
    disposition: hasBlocker(findings) ? "hold" : "accept",
    ingest: buildIngest({
      projectId: input.projectId ?? null,
      titleBlock,
      register,
      title: input.incoming.title ?? null,
    }),
  };
}

/**
 * Columns on `drawings` this intake can legitimately write, and the ones it
 * cannot. `drawings` has no issue-date and no engineer column — those live at
 * set level (`drawing_sets.issued_date`, `drawing_sets.eor_reviewer`), so this
 * payload names them as withheld rather than inventing a home for them.
 */
function buildIngest(args: {
  projectId: string | null;
  titleBlock: DocControlTitleBlock;
  register: RegisterCrossReference;
  title: string | null;
}): DocControlIngest {
  const { projectId, titleBlock, register, title } = args;
  const values: Record<string, string> = {};
  const withheld: DocControlIngest["withheld"] = [];

  const write = (column: string, field: DocControlTitleBlock[keyof DocControlTitleBlock]) => {
    if (field.value !== null) {
      values[column] = field.value;
      return;
    }
    withheld.push({
      column,
      reason: field.observed
        ? "Not stated on the document — left unset rather than written as an empty string."
        : "Not inspected — unknown, and an unknown must never be written as a value.",
    });
  };

  write("sheet_number", titleBlock.sheetNumber);
  write("revision_number", titleBlock.revisionNumber);
  write("project_name", titleBlock.projectName);

  const cleanTitle = String(title ?? "").trim();
  if (cleanTitle) values.title = cleanTitle;

  if (titleBlock.issueDate.value !== null) {
    withheld.push({
      column: "issue_date",
      reason: `Read as ${titleBlock.issueDate.value}, but \`drawings\` has no issue-date column — the set-level date lives on \`drawing_sets.issued_date\`.`,
    });
  }
  if (titleBlock.authorizingEngineer.value !== null) {
    withheld.push({
      column: "authorizing_engineer",
      reason: `Read as "${titleBlock.authorizingEngineer.value}", but \`drawings\` has no engineer column — the set-level EOR lives on \`drawing_sets.eor_reviewer\`.`,
    });
  }

  const matchedId = register.status === "revision-of-record" ? register.matched?.id ?? null : null;

  if (matchedId) {
    return { table: "drawings", operation: "update", match: { id: matchedId }, values, withheld };
  }

  const match: Record<string, string> = {};
  if (projectId) match.project_id = projectId;
  if (titleBlock.sheetNumber.value) match.sheet_number = titleBlock.sheetNumber.value;
  return { table: "drawings", operation: "insert", match, values, withheld };
}
