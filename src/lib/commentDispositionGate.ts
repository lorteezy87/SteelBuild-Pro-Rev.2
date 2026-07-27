/**
 * commentDispositionGate.ts — returned-comment disposition rules (Slice 5 of
 * the drawing approval lifecycle, 2026-07-25).
 *
 * Structured dispositions on `submittal_comment_dispositions` are the gate
 * truth for "are required returned comments resolved?" Sheet-level
 * `submittal_sheet_responses` remain the per-sheet R&R/AAN/NE SoT.
 *
 * Pure: no React, no Supabase, no clock.
 */

export const COMMENT_DISPOSITION_STATUSES = [
  "Unreviewed",
  "Accepted",
  "Incorporated",
  "Clarification Required",
  "RFI Required",
  "Not Applicable",
  "Disputed",
  "Complete",
] as const;

export type CommentDispositionStatus = (typeof COMMENT_DISPOSITION_STATUSES)[number];

/** Statuses that clear a required comment for OFS→IFC / R&R→OFA gating. */
export const RESOLVED_DISPOSITION_STATUSES: ReadonlySet<string> = new Set([
  "Complete",
  "Not Applicable",
  "Incorporated",
]);

export interface CommentDispositionLike {
  id?: string | null;
  comment_number?: string | null;
  location?: string | null;
  comment_text?: string | null;
  status?: string | null;
  is_required?: boolean | null;
  is_deleted?: boolean | null;
}

export type CommentDispositionGateResult =
  | { ok: true }
  | { ok: false; unresolvedCount: number; reason: string; unresolved: CommentDispositionLike[] };

const SENT_OFA = new Set(["Submitted", "Under Review"]);
const RR_SOURCES = new Set(["Revise and Resubmit", "Rejected"]);

const hasOverride = (reason: string | null | undefined): boolean =>
  String(reason ?? "").trim().length > 0;

export function isDispositionResolved(status: string | null | undefined): boolean {
  return RESOLVED_DISPOSITION_STATUSES.has(String(status ?? "").trim());
}

/**
 * Required + not-yet-resolved disposition rows (soft-deleted excluded).
 * Optional comments (`is_required === false`) never gate.
 */
export function collectUnresolvedRequiredComments(
  dispositions: CommentDispositionLike[] | null | undefined,
): CommentDispositionLike[] {
  if (!Array.isArray(dispositions)) return [];
  return dispositions.filter((row) => {
    if (!row || row.is_deleted) return false;
    if (row.is_required === false) return false;
    return !isDispositionResolved(row.status);
  });
}

export type CommentDispositionGateKind = "ofs_to_ifc" | "rr_to_ofa";

export interface CommentDispositionGateInput {
  kind: CommentDispositionGateKind;
  dispositions?: CommentDispositionLike[] | null;
  /** For ofs_to_ifc — target stage from the verb engine. */
  nextStage?: string | null;
  priorStage?: string | null;
  /** For rr_to_ofa — status transition. */
  nextStatus?: string | null;
  priorStatus?: string | null;
  overrideReason?: string | null;
}

/**
 * Evaluate whether unresolved required comments block the move.
 * Returns ok when the move is not a gated transition, when no required
 * comments remain open, or when an audited override reason is present.
 */
export function evaluateCommentDispositionGate(
  input: CommentDispositionGateInput,
): CommentDispositionGateResult {
  let gated = false;
  if (input.kind === "ofs_to_ifc") {
    gated =
      String(input.nextStage ?? "").trim() === "IFC" &&
      String(input.priorStage ?? "").trim() === "OFS";
  } else if (input.kind === "rr_to_ofa") {
    gated =
      RR_SOURCES.has(String(input.priorStatus ?? "").trim()) &&
      SENT_OFA.has(String(input.nextStatus ?? "").trim());
  }
  if (!gated) return { ok: true };
  if (hasOverride(input.overrideReason)) return { ok: true };

  const unresolved = collectUnresolvedRequiredComments(input.dispositions);
  if (unresolved.length === 0) return { ok: true };

  const label =
    input.kind === "ofs_to_ifc"
      ? "issue for construction"
      : "resubmit for approval";
  return {
    ok: false,
    unresolvedCount: unresolved.length,
    unresolved,
    reason:
      `COMMENT_DISPOSITION_BLOCKED: ${unresolved.length} required returned comment(s) remain unresolved — resolve them before you ${label}, or provide an audited override reason.`,
  };
}

/** Seed text for resubmittal notes from open disposition rows. */
export function formatUnresolvedCommentNotes(
  open: CommentDispositionLike[] | null | undefined,
): string {
  const items = Array.isArray(open) ? open : [];
  if (items.length === 0) return "";
  const noun = items.length === 1 ? "comment" : "comments";
  const header = `Addressing ${items.length} required returned ${noun}:`;
  const lines = items.map((it) => {
    const num = String(it.comment_number ?? "").trim() || "—";
    const loc = String(it.location ?? "").trim();
    const text = String(it.comment_text ?? "").trim();
    const status = String(it.status ?? "Unreviewed").trim();
    const where = loc ? ` @ ${loc}` : "";
    const body = text ? ` — ${text}` : "";
    return `• ${num}${where} (${status})${body}`;
  });
  return [header, ...lines].join("\n");
}
