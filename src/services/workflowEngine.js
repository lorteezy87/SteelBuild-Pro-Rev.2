/**
 * workflowEngine.js — Centralized state machine for all trust-critical workflows.
 *
 * ONE source of truth for:
 *   • Which transitions are legal
 *   • What fields are required at each transition
 *   • Who can trigger a transition (role floor)
 *   • What side-effects fire after a successful transition
 *
 * Usage:
 *   import { WORKFLOWS, validateTransition, applyTransition } from "@/services/workflowEngine";
 *   const result = validateTransition("drawing", current.status, "approved", { user, record });
 *   if (!result.valid) { toast.error(result.reason); return; }
 */

// ─── Role hierarchy (lower = more privileged) ──────────────────────────
const ROLE_RANK = { admin: 0, pm: 1, field: 2, viewer: 3 };

function roleAtLeast(userRole, floor) {
  return (ROLE_RANK[userRole] ?? 99) <= (ROLE_RANK[floor] ?? 0);
}

// ─── Workflow definitions ───────────────────────────────────────────────
// Each entity type has:
//   states   – complete list of valid states
//   initial  – default state for new records
//   transitions – map of { "from→to": { requiredFields, minRole, guard?, label } }
//
// guard(record, context) may return { valid, reason } for custom logic.

export const WORKFLOWS = {

  // ── Drawing Set Approval ────────────────────────────────────────────
  drawing_approval: {
    field: "set_approval_status",
    states: ["pending", "approved", "rejected", "superseded"],
    initial: "pending",
    transitions: {
      "pending→approved":    { requiredFields: ["reviewer"],       minRole: "pm",    label: "Approve Set" },
      "pending→rejected":    { requiredFields: ["notes"],          minRole: "pm",    label: "Reject Set" },
      "approved→superseded": { requiredFields: [],                 minRole: "pm",    label: "Supersede" },
      "rejected→pending":    { requiredFields: [],                 minRole: "pm",    label: "Re-submit" },
    },
  },

  // ── Drawing Stage (IFC pipeline) ────────────────────────────────────
  drawing_stage: {
    field: "stage",
    states: ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"],
    initial: "Not Started",
    transitions: {
      "Not Started→OFA": { requiredFields: [],                    minRole: "field", label: "Start OFA" },
      "OFA→BFA":         { requiredFields: [],                    minRole: "field", label: "Back from Approval" },
      "BFA→OFS":         { requiredFields: [],                    minRole: "pm",    label: "Out for Signature" },
      "OFS→BFS":         { requiredFields: [],                    minRole: "pm",    label: "Back from Signature" },
      "BFS→FFF":         { requiredFields: [],                    minRole: "pm",    label: "Fit for Fabrication" },
      "FFF→Released":    { requiredFields: [],                    minRole: "pm",    label: "Release" },
      // Allow skip-forward for admin
      "Not Started→Released": { requiredFields: [],               minRole: "admin", label: "Force Release" },
    },
  },

  // ── RFI Status ──────────────────────────────────────────────────────
  // "Incomplete Response" = GC sent an answer back, but the response doesn't
  // fully address the question and the RFI needs another round. Sits between
  // Under Review and Answered in the lifecycle. Treated as still-open by
  // closed-state filters elsewhere in the app.
  rfi: {
    field: "status",
    states: ["Open", "Under Review", "Incomplete Response", "Answered", "Closed"],
    initial: "Open",
    transitions: {
      "Open→Under Review":                    { requiredFields: ["assigned_to"], minRole: "field", label: "Submit for Review" },
      "Under Review→Answered":                { requiredFields: ["response"],    minRole: "pm",    label: "Answer" },
      "Under Review→Incomplete Response":     { requiredFields: ["response"],    minRole: "pm",    label: "Mark Response Incomplete" },
      "Incomplete Response→Under Review":     { requiredFields: [],              minRole: "pm",    label: "Re-route for Review" },
      "Incomplete Response→Answered":         { requiredFields: ["response"],    minRole: "pm",    label: "Answer" },
      "Answered→Closed":                      { requiredFields: [],              minRole: "pm",    label: "Close" },
      "Under Review→Open":                    { requiredFields: [],              minRole: "pm",    label: "Return to Open" },
      "Closed→Open":                          { requiredFields: [],              minRole: "admin", label: "Reopen" },
    },
  },

  // ── Change Order ────────────────────────────────────────────────────
  change_order: {
    field: "status",
    states: ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Void"],
    initial: "Draft",
    transitions: {
      "Draft→Submitted":          { requiredFields: ["co_amount", "title"],   minRole: "pm",    label: "Submit" },
      "Submitted→Under Review":   { requiredFields: [],                       minRole: "pm",    label: "Begin Review" },
      "Under Review→Approved":    { requiredFields: ["approved_by"],          minRole: "pm",    label: "Approve",
        guard: (record) => {
          if (!record.co_amount || record.co_amount === 0) return { valid: false, reason: "CO amount must be non-zero to approve." };
          return { valid: true };
        },
      },
      "Under Review→Rejected":   { requiredFields: ["notes"],                minRole: "pm",    label: "Reject" },
      "Rejected→Draft":           { requiredFields: [],                       minRole: "pm",    label: "Revise" },
      "Approved→Void":            { requiredFields: ["notes"],                minRole: "admin", label: "Void" },
    },
  },

  // ── Expense Payment ─────────────────────────────────────────────────
  expense_payment: {
    field: "payment_status",
    states: ["Unpaid", "Pending Approval", "Paid", "Disputed", "Voided"],
    initial: "Unpaid",
    transitions: {
      "Unpaid→Pending Approval":       { requiredFields: [],                  minRole: "field", label: "Request Approval" },
      "Pending Approval→Paid":         { requiredFields: ["approved_by"],     minRole: "pm",    label: "Approve & Pay" },
      "Pending Approval→Disputed":     { requiredFields: ["notes"],           minRole: "pm",    label: "Dispute" },
      "Unpaid→Paid":                   { requiredFields: [],                  minRole: "pm",    label: "Mark Paid" },
      "Paid→Voided":                   { requiredFields: ["notes"],           minRole: "admin", label: "Void" },
      "Disputed→Unpaid":               { requiredFields: [],                  minRole: "pm",    label: "Resolve Dispute" },
    },
  },

  // ── Work Package Phase ──────────────────────────────────────────────
  work_package: {
    field: "status",
    states: ["Not Started", "Detailing", "Fabrication", "Erection", "Install", "Complete"],
    initial: "Not Started",
    transitions: {
      "Not Started→Detailing":   { requiredFields: [],                        minRole: "pm",   label: "Start Detailing" },
      "Detailing→Fabrication":   { requiredFields: [],                        minRole: "pm",   label: "Start Fabrication",
        guard: (record) => {
          if (!record.linked_drawing_ids && !record.linkedDrawings?.length) {
            return { valid: false, reason: "Fabrication requires at least one linked, approved drawing." };
          }
          return { valid: true };
        },
      },
      "Fabrication→Erection":    { requiredFields: [],                        minRole: "pm",   label: "Start Erection" },
      "Erection→Install":        { requiredFields: [],                        minRole: "field", label: "Start Install" },
      "Install→Complete":        { requiredFields: [],                        minRole: "pm",   label: "Mark Complete" },
    },
  },

  // ── Delivery Status ─────────────────────────────────────────────────
  delivery: {
    field: "status",
    states: ["Scheduled", "In Transit", "Delivered", "Partial", "Rejected", "Delayed"],
    initial: "Scheduled",
    transitions: {
      "Scheduled→In Transit":  { requiredFields: [],                          minRole: "field", label: "Mark In Transit" },
      "Scheduled→Delayed":     { requiredFields: ["notes"],                   minRole: "field", label: "Mark Delayed" },
      "In Transit→Delivered":  { requiredFields: [],                          minRole: "field", label: "Mark Delivered" },
      "In Transit→Partial":    { requiredFields: ["notes"],                   minRole: "field", label: "Partial Delivery" },
      "In Transit→Rejected":   { requiredFields: ["notes"],                   minRole: "field", label: "Reject" },
      "Delayed→In Transit":    { requiredFields: [],                          minRole: "field", label: "Resume Transit" },
      "Partial→Delivered":     { requiredFields: [],                          minRole: "field", label: "Complete Delivery" },
    },
  },

  // ── SOV Item Status ─────────────────────────────────────────────────
  sov_item: {
    field: "status",
    states: ["Draft", "Submitted", "Approved", "Paid", "Finalized"],
    initial: "Draft",
    transitions: {
      "Draft→Submitted":       { requiredFields: [],                          minRole: "pm",   label: "Submit" },
      "Submitted→Approved":    { requiredFields: [],                          minRole: "pm",   label: "Approve" },
      "Approved→Paid":         { requiredFields: [],                          minRole: "pm",   label: "Mark Paid" },
      "Paid→Finalized":        { requiredFields: [],                          minRole: "admin", label: "Finalize" },
    },
  },
};

// ─── Core validation ────────────────────────────────────────────────────

/**
 * Validates whether a status transition is legal.
 *
 * @param {string} workflowName  – key in WORKFLOWS
 * @param {string} fromStatus    – current status value
 * @param {string} toStatus      – desired next status
 * @param {object} context       – { record, user: { role }, fields?: {} }
 * @returns {{ valid: boolean, reason?: string, transition?: object }}
 */
export function validateTransition(workflowName, fromStatus, toStatus, context = {}) {
  const workflow = WORKFLOWS[workflowName];
  if (!workflow) {
    return { valid: false, reason: `Unknown workflow: ${workflowName}` };
  }

  if (fromStatus === toStatus) {
    return { valid: true, transition: null }; // no-op
  }

  const key = `${fromStatus}→${toStatus}`;
  const transition = workflow.transitions[key];

  if (!transition) {
    return {
      valid: false,
      reason: `Transition "${fromStatus}" → "${toStatus}" is not allowed for ${workflowName}.`,
    };
  }

  // Role check
  const userRole = context.user?.role || "viewer";
  if (!roleAtLeast(userRole, transition.minRole)) {
    return {
      valid: false,
      reason: `Requires at least "${transition.minRole}" role. Your role: "${userRole}".`,
    };
  }

  // Required fields check
  const record = { ...context.record, ...context.fields };
  for (const field of transition.requiredFields) {
    const val = record[field];
    if (val === undefined || val === null || val === "") {
      return {
        valid: false,
        reason: `Field "${field}" is required for this transition.`,
      };
    }
  }

  // Custom guard
  if (transition.guard) {
    const guardResult = transition.guard(record, context);
    if (guardResult && !guardResult.valid) {
      return { valid: false, reason: guardResult.reason };
    }
  }

  return { valid: true, transition };
}

/**
 * Returns all valid next states from a given state.
 */
export function getValidTransitions(workflowName, currentStatus, context = {}) {
  const workflow = WORKFLOWS[workflowName];
  if (!workflow) return [];

  return Object.entries(workflow.transitions)
    .filter(([key]) => key.startsWith(`${currentStatus}→`))
    .map(([key, transition]) => {
      const toStatus = key.split("→")[1];
      const validation = validateTransition(workflowName, currentStatus, toStatus, context);
      return {
        toStatus,
        label: transition.label,
        allowed: validation.valid,
        reason: validation.reason || null,
        requiredFields: transition.requiredFields,
        minRole: transition.minRole,
      };
    });
}

/**
 * Returns the field name that a workflow controls.
 */
export function getWorkflowField(workflowName) {
  return WORKFLOWS[workflowName]?.field || null;
}

/**
 * Build an audit entry for a transition.
 */
export function buildTransitionAudit(workflowName, fromStatus, toStatus, context = {}) {
  return {
    workflow: workflowName,
    from_status: fromStatus,
    to_status: toStatus,
    transitioned_by: context.user?.email || context.user?.id || "unknown",
    transitioned_at: new Date().toISOString(),
    role: context.user?.role || "unknown",
    record_id: context.record?.id || null,
    project_id: context.record?.project_id || null,
    metadata: context.metadata || null,
  };
}
