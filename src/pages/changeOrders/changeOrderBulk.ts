export type BulkAction = "submit" | "approve" | "delete";

export function buildSubmittedPatch(submittedDate: string) {
  return {
    status: "Submitted",
    submitted_date: submittedDate,
  };
}

export function buildApprovedPatch(approvedDate: string, approvedBy: string) {
  if (!approvedBy || !String(approvedBy).trim()) {
    throw new Error("approvedBy is required");
  }

  return {
    status: "Approved",
    approved_date: approvedDate,
    approved_by: approvedBy,
  };
}

export function reconcileSelectedIds(
  selectedIds: Iterable<string>,
  visibleIds: Iterable<string>,
  succeededIds: Iterable<string> = [],
) {
  const visible = new Set(visibleIds);
  const succeeded = new Set(succeededIds);
  return new Set([...selectedIds].filter((id) => visible.has(id) && !succeeded.has(id)));
}

const ACTION_LABELS: Record<BulkAction, { verb: string; past: string }> = {
  submit: { verb: "submit", past: "Submitted" },
  approve: { verb: "approve", past: "Approved" },
  delete: { verb: "delete", past: "Deleted" },
};

export function summarizeBulkResult(
  action: BulkAction,
  total: number,
  succeeded: number,
  failed: number,
) {
  const labels = ACTION_LABELS[action];
  if (failed === total) {
    return {
      level: "error" as const,
      message: `Failed to ${labels.verb} ${total} change order${total === 1 ? "" : "s"}`,
    };
  }
  if (failed > 0) {
    return {
      level: "warning" as const,
      message: `${labels.past} ${succeeded} of ${total} change orders - ${failed} failed`,
    };
  }
  return {
    level: "success" as const,
    message: `${labels.past} ${succeeded} change order${succeeded === 1 ? "" : "s"}`,
  };
}
