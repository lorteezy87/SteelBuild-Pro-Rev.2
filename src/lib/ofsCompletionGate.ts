/**
 * ofsCompletionGate.ts — OFS (Out for Scrub) workflow gates (Slice 4 of the
 * drawing approval lifecycle, 2026-07-25).
 *
 * Product rules:
 *   1. OFS is post-approval scrub — not a resubmittal loop (≠ OFA/R&R).
 *   2. OFS → IFC requires a completion checklist (or audited override).
 *   3. OFS → OFA (Submitted / Under Review) is blocked without override.
 *   4. Released for Fabrication is only allowed from IFC stage without
 *      override (cannot skip OFS / IFC).
 *
 * OFS remains a derived stage (Approved/AAN + Detailer-class BIC). Checklist
 * evidence is stamped into submittals.metadata.ofs_checklist at issue time.
 *
 * Pure: no React, no Supabase, no clock.
 */
import { submittalStatusToStage } from "@/lib/submittalStageMapping";

export type OfsChecklistKey =
  | "comments_addressed"
  | "markups_incorporated"
  | "sheets_ready"
  | "authorized_to_issue";

export interface OfsChecklistItem {
  key: OfsChecklistKey;
  label: string;
  hint: string;
}

/** Fixed scrub-completion checklist shown in the IFC issue dialog. */
export const OFS_CHECKLIST_ITEMS: readonly OfsChecklistItem[] = [
  {
    key: "comments_addressed",
    label: "Reviewer comments addressed",
    hint: "Clouds / notes from the return are resolved or dispositioned.",
  },
  {
    key: "markups_incorporated",
    label: "Markups incorporated",
    hint: "Redlines are in the model / sheets — scrub is not a resubmittal.",
  },
  {
    key: "sheets_ready",
    label: "Sheets ready for IFC",
    hint: "Package contents are construction-ready after scrub.",
  },
  {
    key: "authorized_to_issue",
    label: "Authorized to issue for construction",
    hint: "Confirm authority to move this package to IFC.",
  },
] as const;

export type OfsChecklistState = Partial<Record<OfsChecklistKey, boolean>>;

export type OfsGateResult =
  | { ok: true }
  | { ok: false; missing: string[]; reason: string };

const SENT_OFA_STATUSES = new Set(["Submitted", "Under Review"]);

const hasOverride = (reason: string | null | undefined): boolean =>
  String(reason ?? "").trim().length > 0;

export function isOfsChecklistComplete(
  checklist: OfsChecklistState | null | undefined,
): boolean {
  const state = checklist ?? {};
  return OFS_CHECKLIST_ITEMS.every((item) => state[item.key] === true);
}

function missingChecklistLabels(checklist: OfsChecklistState | null | undefined): string[] {
  const state = checklist ?? {};
  return OFS_CHECKLIST_ITEMS.filter((item) => state[item.key] !== true).map((i) => i.label);
}

export interface OfsIfcGateInput {
  priorStatus: string | null | undefined;
  priorBallInCourt: string | null | undefined;
  nextStage: string | null | undefined;
  checklist?: OfsChecklistState | null;
  overrideReason?: string | null;
}

/**
 * Gate OFS → IFC: require checklist completion unless an override reason is
 * supplied (audited at the write site).
 */
export function evaluateOfsIfcGate(input: OfsIfcGateInput): OfsGateResult {
  if (String(input.nextStage ?? "").trim() !== "IFC") return { ok: true };

  const priorStage = submittalStatusToStage(
    input.priorStatus,
    input.priorBallInCourt,
    null,
  );
  if (priorStage !== "OFS") return { ok: true };
  if (hasOverride(input.overrideReason)) return { ok: true };

  const missing = missingChecklistLabels(input.checklist);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    reason:
      `OFS_IFC_BLOCKED: This package is Out for Scrub — issue for construction only after the scrub checklist is complete. ` +
      `Missing: ${missing.join(", ")}.`,
  };
}

export interface OfsToOfaGateInput {
  priorStatus: string | null | undefined;
  priorBallInCourt: string | null | undefined;
  nextStatus: string | null | undefined;
  overrideReason?: string | null;
}

/**
 * Gate OFS → OFA: scrub must not silently become a resubmittal. Override
 * requires a written reason (audited at the write site).
 */
export function evaluateOfsToOfaGate(input: OfsToOfaGateInput): OfsGateResult {
  const next = String(input.nextStatus ?? "").trim();
  if (!SENT_OFA_STATUSES.has(next)) return { ok: true };

  const priorStage = submittalStatusToStage(
    input.priorStatus,
    input.priorBallInCourt,
    null,
  );
  if (priorStage !== "OFS") return { ok: true };
  if (hasOverride(input.overrideReason)) return { ok: true };

  return {
    ok: false,
    missing: ["audited override reason"],
    reason:
      "OFS_TO_OFA_BLOCKED: Out for Scrub is post-approval cleanup — it is not a resubmittal. " +
      "Move back out for approval only with an audited override reason.",
  };
}

export interface SkipOfsReleaseGateInput {
  priorStatus: string | null | undefined;
  priorBallInCourt: string | null | undefined;
  nextStatus: string | null | undefined;
  overrideReason?: string | null;
}

/**
 * Gate Released for Fabrication: must already be at IFC (or override).
 * Blocks BFA→Released and OFS→Released skips.
 */
export function evaluateSkipOfsReleaseGate(input: SkipOfsReleaseGateInput): OfsGateResult {
  if (String(input.nextStatus ?? "").trim() !== "Released for Fabrication") {
    return { ok: true };
  }

  const prior = String(input.priorStatus ?? "").trim();
  if (prior !== "Approved" && prior !== "Approved as Noted") return { ok: true };
  if (hasOverride(input.overrideReason)) return { ok: true };

  const priorStage = submittalStatusToStage(
    input.priorStatus,
    input.priorBallInCourt,
    null,
  );
  if (priorStage === "IFC") return { ok: true };

  return {
    ok: false,
    missing: ["IFC stage"],
    reason:
      `OFS_SKIP_BLOCKED: Cannot release for fabrication from ${priorStage || "this stage"} — ` +
      `Approved packages must pass through OFS (Out for Scrub) then IFC. ` +
      `Provide an audited override reason to skip.`,
  };
}
