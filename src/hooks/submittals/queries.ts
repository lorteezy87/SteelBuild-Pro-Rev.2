import { entities } from "@/api/supabaseClient";
import { OPEN_STATUSES, TERMINAL_STATUSES } from "./constants";
import type { Submittal, SubmittalRound } from "./types";

export const SUBMITTAL_QUERY_STALE_TIME = 60_000;
export const SUBMITTAL_QUERY_LIMIT = 2000;

export function fetchSubmittals(
  projectId: string | null | undefined,
): Promise<Submittal[]> {
  return entities.Submittal.filter(
    { project_id: projectId },
    "-submitted_date",
    SUBMITTAL_QUERY_LIMIT,
  );
}

export function fetchSubmittalRounds(
  projectId: string | null | undefined,
): Promise<SubmittalRound[]> {
  return entities.SubmittalRound.filter(
    { project_id: projectId },
    "-round_number",
    SUBMITTAL_QUERY_LIMIT,
  );
}

export function groupSubmittalRounds<
  T extends {
    submittal_id?: string | null;
    round_number?: number | null;
  },
>(rounds: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const round of rounds) {
    const submittalId = round.submittal_id;
    if (!submittalId) continue;
    if (!grouped[submittalId]) grouped[submittalId] = [];
    grouped[submittalId].push(round);
  }
  for (const submittalRounds of Object.values(grouped)) {
    submittalRounds.sort(
      (left, right) =>
        (left.round_number || 1) - (right.round_number || 1),
    );
  }
  return grouped;
}

export function groupSubmittalsByStatus(
  submittals: Submittal[],
): Record<string, Submittal[]> {
  const grouped: Record<string, Submittal[]> = {};
  for (const submittal of submittals) {
    const status = submittal.status || "Draft";
    if (!grouped[status]) grouped[status] = [];
    grouped[status].push(submittal);
  }
  return grouped;
}

export function summarizeDrawingSets(
  submittals: Submittal[],
): Record<string, { total: number; open: number }> {
  const grouped: Record<string, { total: number; open: number }> = {};
  for (const submittal of submittals) {
    const drawingSetIds = Array.isArray(submittal.drawing_set_ids)
      ? submittal.drawing_set_ids
      : [];
    for (const drawingSetId of drawingSetIds) {
      if (!grouped[drawingSetId]) {
        grouped[drawingSetId] = { total: 0, open: 0 };
      }
      grouped[drawingSetId].total++;
      if (OPEN_STATUSES.has(submittal.status)) {
        grouped[drawingSetId].open++;
      }
    }
  }
  return grouped;
}

export function selectOverdueSubmittals(
  submittals: Submittal[],
  now = new Date(),
): Submittal[] {
  return submittals.filter((submittal) => {
    if (!submittal.required_date) return false;
    if (TERMINAL_STATUSES.has(submittal.status)) return false;
    return new Date(submittal.required_date) < now;
  });
}

export function summarizeSubmittalKpis(
  submittals: Submittal[],
  overdueCount: number,
) {
  const pending = submittals.filter(
    (submittal) =>
      submittal.status === "Submitted" ||
      submittal.status === "Under Review",
  ).length;
  const approved = submittals.filter(
    (submittal) =>
      submittal.status === "Approved" ||
      submittal.status === "Approved as Noted" ||
      submittal.status === "Released for Fabrication",
  ).length;
  const rejected = submittals.filter(
    (submittal) =>
      submittal.status === "Rejected" ||
      submittal.status === "Revise and Resubmit",
  ).length;
  return {
    total: submittals.length,
    pending,
    approved,
    rejected,
    overdue: overdueCount,
  };
}
