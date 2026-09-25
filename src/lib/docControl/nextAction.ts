import type { DocControlRecord } from "./types";

export type DocControlNextActionKind =
  | "start_revision_upload"
  | "resolve_ambiguity"
  | "upload_set"
  | "review_source_pdf";

export type DocControlNextAction = {
  kind: DocControlNextActionKind;
  label: string;
  detail: string;
  /** Existing route only. Null means the reviewer must resolve evidence first. */
  href: "/Drawings" | null;
};

/**
 * Selects the next read-only handoff from intake evidence. This helper never
 * carries a target drawing id, file, or mutation instruction: ambiguous and
 * incomplete register evidence must remain a human review decision.
 */
export function nextActionForRecord(
  record: DocControlRecord,
  registerComplete: boolean,
): DocControlNextAction {
  if (!registerComplete || record.register.status === "register-incomplete") {
    return {
      kind: "review_source_pdf",
      label: "Review source PDF",
      detail: "The register read is incomplete, so this sheet cannot be classified as new or matched safely.",
      href: null,
    };
  }

  if (record.register.status === "revision-of-record") {
    return {
      kind: "start_revision_upload",
      label: "Start revision upload",
      detail: "A single live register sheet matches. Continue in the revision-upload workflow to preserve its controlled history.",
      href: "/Drawings",
    };
  }

  if (record.register.status === "new-to-register") {
    return {
      kind: "upload_set",
      label: "Use Upload Set",
      detail: "No matching live register sheet was found. Add it through the controlled drawing-set intake.",
      href: "/Drawings",
    };
  }

  return {
    kind: "resolve_ambiguity",
    label: "Resolve sheet match",
    detail: "This intake cannot identify one safe register target. Resolve the sheet number and register evidence before uploading.",
    href: null,
  };
}
