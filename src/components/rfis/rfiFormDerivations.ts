import type { PreflightResult } from "@/lib/rfiPreflight";

export interface RfiMetadata extends Record<string, unknown> {
  rfi_type?: string;
  proposed_solution?: string;
  fab_hold?: boolean;
  piece_marks?: string;
  fab_impact?: boolean;
  erection_impact?: boolean;
  drawing_revision_required?: boolean;
  change_order_likely?: boolean;
  preflight_score?: number | null;
  preflight_override?: unknown;
}

export interface RfiFormData extends Record<string, unknown> {
  project_id: string;
  title: string;
  description: string;
  question: string;
  answer: string;
  drawing_reference: string;
  spec_section: string;
  priority: string;
  status: string;
  discipline: string;
  submitted_by: string;
  submitted_date: string;
  date_required: string;
  date_answered: string;
  assigned_to: string;
  answered_by: string;
  ball_in_court: string;
  cost_impact: boolean;
  cost_impact_amount: string | number | null;
  schedule_impact: boolean;
  schedule_impact_days: string | number | null;
  distribution_list: string;
  work_package_id: string | null;
  drawing_set_id: string | null;
  area_sequence: string;
  rfi_type: string;
  proposed_solution: string;
  fab_hold: boolean;
  piece_marks: string;
  fab_impact: boolean;
  erection_impact: boolean;
  drawing_revision_required: boolean;
  change_order_likely: boolean;
  metadata?: RfiMetadata | null;
}

export interface RfiRecord extends Partial<RfiFormData> {
  id?: string;
  rfi_number?: string;
}

export interface RfiPrefill extends Partial<RfiFormData> {
  project_id?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

interface WorkPackageRecord {
  id: string;
  wp_number?: string | null;
  name?: string | null;
}

interface DrawingSetRecord {
  id: string;
  set_name?: string | null;
  revision?: string | null;
  is_deleted?: boolean | null;
}

interface AutoLinkSuggestion {
  type?: string;
  entityId?: string;
  matchedEntity?: { drawing_set_id?: string | null };
}

export function buildEmptyRfiForm(
  projectId: string | null | undefined,
  today = new Date().toISOString().split("T")[0],
): RfiFormData {
  return {
    project_id: projectId || "",
    title: "",
    description: "",
    question: "",
    answer: "",
    drawing_reference: "",
    spec_section: "",
    priority: "Medium",
    status: "Open",
    discipline: "",
    submitted_by: "",
    submitted_date: today,
    date_required: "",
    date_answered: "",
    assigned_to: "",
    answered_by: "",
    ball_in_court: "Contractor",
    cost_impact: false,
    cost_impact_amount: "",
    schedule_impact: false,
    schedule_impact_days: "",
    distribution_list: "",
    work_package_id: "",
    drawing_set_id: "",
    area_sequence: "",
    rfi_type: "",
    proposed_solution: "",
    fab_hold: false,
    piece_marks: "",
    fab_impact: false,
    erection_impact: false,
    drawing_revision_required: false,
    change_order_likely: false,
  };
}

export function seedRfiForm({
  projectId,
  rfi,
  initialDrawingReference = "",
  prefill,
  today,
}: {
  projectId?: string | null;
  rfi?: RfiRecord | null;
  initialDrawingReference?: string;
  prefill?: RfiPrefill | null;
  today?: string;
}): RfiFormData {
  const empty = buildEmptyRfiForm(projectId, today);
  if (!rfi) {
    return {
      ...empty,
      drawing_reference: initialDrawingReference || empty.drawing_reference,
      ...(prefill || {}),
      project_id: projectId || empty.project_id,
    };
  }

  const metadata = rfi.metadata || {};
  return {
    ...empty,
    ...rfi,
    rfi_type: String(metadata.rfi_type || ""),
    proposed_solution: String(metadata.proposed_solution || ""),
    fab_hold: Boolean(metadata.fab_hold),
    piece_marks: String(metadata.piece_marks || ""),
    fab_impact: Boolean(metadata.fab_impact),
    erection_impact: Boolean(metadata.erection_impact),
    drawing_revision_required: Boolean(metadata.drawing_revision_required),
    change_order_likely: Boolean(metadata.change_order_likely),
  };
}

export function getActiveRfiProjectId(
  formProjectId: string | null | undefined,
  projectId: string | null | undefined,
): string {
  return formProjectId || projectId || "";
}

export function cleanRfiNumericFields<T extends {
  cost_impact_amount?: RfiFormData["cost_impact_amount"];
  schedule_impact_days?: RfiFormData["schedule_impact_days"];
}>(data: T): T & {
  cost_impact_amount: number | null;
  schedule_impact_days: number | null;
} {
  return {
    ...data,
    cost_impact_amount:
      data.cost_impact_amount === "" ? null
        : data.cost_impact_amount !== undefined ? Number(data.cost_impact_amount) : null,
    schedule_impact_days:
      data.schedule_impact_days === "" ? null
        : data.schedule_impact_days !== undefined ? Number(data.schedule_impact_days) : null,
  };
}

export function buildRfiFormPayload(
  formData: RfiFormData,
  preflight: PreflightResult | null,
  overrideReason: string | null = null,
  nowIso = new Date().toISOString(),
): Omit<RfiFormData, "rfi_type" | "proposed_solution" | "fab_hold" | "piece_marks" | "fab_impact" | "erection_impact" | "drawing_revision_required" | "change_order_likely"> & { metadata: RfiMetadata } {
  const {
    rfi_type,
    proposed_solution,
    fab_hold,
    piece_marks,
    fab_impact,
    erection_impact,
    drawing_revision_required,
    change_order_likely,
    ...rest
  } = formData;

  return {
    ...rest,
    metadata: {
      ...(formData.metadata || {}),
      rfi_type,
      proposed_solution,
      fab_hold: Boolean(fab_hold),
      piece_marks: (piece_marks || "").trim(),
      fab_impact: Boolean(fab_impact),
      erection_impact: Boolean(erection_impact),
      drawing_revision_required: Boolean(drawing_revision_required),
      change_order_likely: Boolean(change_order_likely),
      preflight_score: preflight
        ? preflight.score
        : (formData.metadata?.preflight_score ?? null),
      preflight_override: overrideReason
        ? {
            reason: overrideReason,
            score: preflight?.score ?? null,
            blockers: (preflight?.blockers || []).map((blocker) => blocker.key),
            at: nowIso,
          }
        : (formData.metadata?.preflight_override ?? null),
    },
  };
}

export function getRfiSubmissionError(
  formData: RfiFormData,
  preflight: PreflightResult,
  overrideAcknowledged: boolean,
  overrideReason: string,
): string | null {
  if (!formData.title?.trim()) return "Title is required";
  if (preflight.passed) return null;
  if (!overrideAcknowledged) {
    return `Preflight: resolve ${preflight.blockers.map((blocker) => blocker.label).join("; ")} — or check "Submit anyway" and give a reason`;
  }
  if (!overrideReason.trim()) {
    return "Enter a reason to override the preflight and submit";
  }
  return null;
}

export function deriveAutoLinkPatch(
  suggestion: AutoLinkSuggestion,
): Pick<RfiFormData, "work_package_id"> | Pick<RfiFormData, "drawing_set_id"> | null {
  if (
    (suggestion.type === "work_package" || suggestion.type === "sequence")
    && suggestion.entityId
  ) {
    return { work_package_id: suggestion.entityId };
  }
  if (suggestion.type === "drawing" && suggestion.matchedEntity?.drawing_set_id) {
    return { drawing_set_id: suggestion.matchedEntity.drawing_set_id };
  }
  return null;
}

export function buildWorkPackageOptions(
  workPackages: WorkPackageRecord[],
): SelectOption[] {
  return workPackages.map((workPackage) => ({
    value: workPackage.id,
    label: [workPackage.wp_number, workPackage.name].filter(Boolean).join(" — ")
      || workPackage.id.slice(0, 8),
  }));
}

export function buildDrawingSetOptions(
  drawingSets: DrawingSetRecord[],
): SelectOption[] {
  return drawingSets
    .filter((drawingSet) => !drawingSet.is_deleted)
    .map((drawingSet) => ({
      value: drawingSet.id,
      label: [
        drawingSet.set_name,
        drawingSet.revision ? `Rev ${drawingSet.revision}` : null,
      ].filter(Boolean).join(" — ") || drawingSet.id.slice(0, 8),
    }));
}
