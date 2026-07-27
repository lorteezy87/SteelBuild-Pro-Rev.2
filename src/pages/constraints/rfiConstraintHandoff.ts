/**
 * Build a Constraints create-form prefill from an RFI (office → field handoff).
 */

export type RfiLike = {
  id?: string;
  rfi_number?: string | null;
  title?: string | null;
  subject?: string | null;
  question?: string | null;
  description?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  project_id?: string | null;
};

export function buildConstraintPrefillFromRfi(
  rfi: RfiLike,
  projectId?: string | null,
): Record<string, string> {
  const label = rfi.rfi_number ? `RFI ${rfi.rfi_number}` : "RFI";
  return {
    title: `${label}: ${rfi.title || rfi.subject || "upstream blocker"}`.slice(0, 200),
    description: rfi.question || rfi.description || "",
    constraint_type: "Design",
    meeting_reference: label,
    project_id: projectId || rfi.project_id || "",
    due_date: rfi.due_date || "",
    assigned_to: rfi.assigned_to || "",
    priority: "High",
    status: "Open",
  };
}
