import { daysUntil } from "@/lib/dateMath";
import { evaluateApproverNotes } from "@/lib/approverNotes";
import { computeSubmittalRiskAging } from "@/lib/submittalRiskAging";
import { submittalStatusToStage } from "@/lib/submittalStageMapping";
import type { SubmittalRiskAssessment } from "@/lib/submittalRiskAging";
import type { Submittal, SubmittalRoundRecord } from "./types";

export interface LinkedRfiRecord extends Record<string, unknown> {
  id?: string;
  drawing_set_id?: string;
  rfi_number?: string;
  number?: string;
  title?: string;
  subject?: string;
}

const OVERDUE_EXCLUDED_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

export interface SubmittalDetailSummary {
  approverNotesStatus: ReturnType<typeof evaluateApproverNotes>;
  overdue: boolean;
  overdueDays: number;
  risk: SubmittalRiskAssessment | null;
  riskChipColor: string;
}

export function deriveSubmittalDetailSummary(
  submittal: Submittal,
): SubmittalDetailSummary {
  const requiredDate = submittal.required_date || null;
  const overdueDays = requiredDate ? Math.abs(daysUntil(requiredDate)) : 0;
  const overdue = Boolean(
    requiredDate &&
      !OVERDUE_EXCLUDED_STATUSES.has(submittal.status ?? "") &&
      daysUntil(requiredDate) < 0,
  );
  const workflowStage = submittalStatusToStage(
    submittal.status,
    submittal.ball_in_court,
    submittal.approved_date,
  );
  const risk = computeSubmittalRiskAging({
    stage: workflowStage,
    dueDate: requiredDate,
    statusChangedAt:
      submittal.returned_date ||
      submittal.approved_date ||
      submittal.updated_at ||
      submittal.submitted_date ||
      null,
    useWorkdays: true,
  });
  const riskChipColor =
    risk?.tier === "critical"
      ? "var(--status-error)"
      : risk?.tier === "urgent"
        ? "var(--status-warning)"
        : risk?.tier === "attention"
          ? "var(--accent)"
          : "var(--text-muted)";

  return {
    approverNotesStatus: evaluateApproverNotes(submittal),
    overdue,
    overdueDays,
    risk,
    riskChipColor,
  };
}

export function deriveRelatedSetRfis(
  submittal: Submittal | null,
  allRfis: LinkedRfiRecord[],
): LinkedRfiRecord[] {
  const setIds = Array.isArray(submittal?.drawing_set_ids)
    ? submittal.drawing_set_ids
    : [];
  if (!setIds.length) return [];

  const manuallyLinkedIds = new Set(
    Array.isArray(submittal?.linked_rfi_ids) ? submittal.linked_rfi_ids : [],
  );
  return allRfis.filter(
    (rfi) =>
      Boolean(rfi.drawing_set_id) &&
      setIds.includes(rfi.drawing_set_id as string) &&
      !manuallyLinkedIds.has(rfi.id as string),
  );
}

export interface NewRoundActionModel {
  isResubmit: boolean;
  label: string;
  helperText: string | null;
}

export function deriveNewRoundAction(
  submittal: Submittal,
  rounds: SubmittalRoundRecord[],
): NewRoundActionModel {
  const isResubmit = ["Revise and Resubmit", "Rejected"].includes(
    submittal.status ?? "",
  );
  const lastRoundNumber = rounds.length
    ? rounds[rounds.length - 1].round_number || rounds.length
    : submittal.total_rounds || 0;
  const nextRoundNumber = (lastRoundNumber || 0) + 1;

  return {
    isResubmit,
    label: isResubmit
      ? `↻ Start Resubmittal — Round ${nextRoundNumber}`
      : "+ New Round",
    helperText: isResubmit
      ? "Carries the reviewer's open comments forward."
      : null,
  };
}
