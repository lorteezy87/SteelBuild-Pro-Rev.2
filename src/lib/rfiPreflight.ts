/**
 * rfiPreflight — deterministic RFI "preflight" scorecard + classification.
 *
 * Slice 1 of the RFI workflow backbone (S&H-controlled). Pure, no I/O, no AI:
 * given the in-progress RFI form values, it returns a list of quality checks,
 * a 0–100 score, and the subset of *required* checks that are failing
 * ("blockers"). The composer uses `blockers` to gate submission and renders
 * `checks` as a live scorecard.
 *
 * Grounded in the SteelBuild RFI log schema + AIA G716 completeness and the
 * Skyport general-notes rule that means-and-methods RFIs are returned
 * unreviewed. Everything here is deterministic so it can be unit-tested and
 * never silently alters project data.
 */

export const RFI_TYPES = [
  "Design Clarification",
  "Field Condition",
  "Coordination",
  "Substitution",
  "Missing Information",
  "Conflict",
];

export interface PreflightCheck {
  key: string;
  label: string;
  pass: boolean;
  /** When true, a failing check blocks submission. */
  required: boolean;
  hint?: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  /** 0–100, fraction of all checks passing. */
  score: number;
  /** Required checks that are failing — submission is gated until empty. */
  blockers: PreflightCheck[];
  passed: boolean;
}

// Means-and-methods / sequencing questions are the reviewer's responsibility,
// not the design team's — Skyport general notes say they're returned
// unreviewed, so we flag (soft, non-blocking) rather than let them ship blind.
const MEANS_METHODS_RE =
  /\b(means and methods|sequenc(?:e|ing)|installation method|how (?:do|should) (?:i|we) (?:install|erect|build))\b/i;

/** Types where a proposed resolution is mandatory before submit. */
function typeRequiresProposed(type?: string): boolean {
  return type === "Substitution" || type === "Design Clarification";
}

export function buildRfiPreflight(form: Record<string, any> = {}): PreflightResult {
  const hasReference = Boolean(
    String(form.drawing_reference || "").trim() ||
    String(form.spec_section || "").trim() ||
    form.drawing_set_id ||
    form.work_package_id
  );
  const question = String(form.question || "").trim();
  const questionMarks = (question.match(/\?/g) || []).length;
  const proposed = String(form.proposed_solution || "").trim();
  const scanText = `${form.title || ""} ${question}`;
  // Impact can be quantified (cost/schedule) OR qualitative (the slice-3 flags).
  // Form fields are top-level while composing; fall back to metadata for a saved RFI.
  const m = form.metadata || {};
  const hasImpact = Boolean(
    form.cost_impact || form.schedule_impact ||
    form.fab_impact || form.erection_impact ||
    form.drawing_revision_required || form.change_order_likely ||
    m.fab_impact || m.erection_impact || m.drawing_revision_required || m.change_order_likely,
  );

  const checks: PreflightCheck[] = [
    {
      key: "type",
      label: "RFI type selected",
      pass: Boolean(form.rfi_type),
      required: true,
      hint: "Classify the RFI so routing and required fields can adapt.",
    },
    {
      key: "reference",
      label: "Linked to a drawing, spec, set, or work package",
      pass: hasReference,
      required: true,
      hint: "Attach the sheet, spec section, drawing set, or work package this question is about.",
    },
    {
      key: "question",
      label: "Question is present",
      pass: question.length >= 10,
      required: true,
      hint: "Write a clear, single question (at least ~10 characters).",
    },
    {
      key: "reply_date",
      label: "Requested reply date set",
      pass: Boolean(form.date_required),
      required: true,
      hint: "A requested-by date lets the system track aging and ball-in-court.",
    },
    {
      key: "single_question",
      label: "Single, focused question",
      pass: questionMarks <= 1,
      required: false,
      hint: "This appears to ask multiple questions — split into separate RFIs for cleaner answers.",
    },
    {
      key: "proposed",
      label: "Proposed resolution provided",
      pass: proposed.length > 0,
      required: typeRequiresProposed(form.rfi_type),
      hint: "Offer your recommended answer — speeds review and documents intent.",
    },
    {
      key: "impact",
      label: "Impact assessed",
      pass: hasImpact,
      required: false,
      hint: "Flag any cost, schedule, fabrication, erection, drawing-revision, or change-order impact.",
    },
    {
      key: "not_means_methods",
      label: "Not a means-and-methods question",
      pass: !MEANS_METHODS_RE.test(scanText),
      required: false,
      hint: "Means-and-methods / sequencing RFIs are typically returned unreviewed (per Skyport general notes).",
    },
  ];

  const blockers = checks.filter((c) => c.required && !c.pass);
  const passCount = checks.filter((c) => c.pass).length;
  const score = checks.length ? Math.round((passCount / checks.length) * 100) : 0;
  return { checks, score, blockers, passed: blockers.length === 0 };
}
