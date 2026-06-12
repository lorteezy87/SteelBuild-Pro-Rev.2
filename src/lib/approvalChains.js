/**
 * approvalChains.js — Custom approval routing for submittals (§20).
 *
 * A chain is an ordered list of ball-in-court parties a submittal walks
 * through on its way out for approval, e.g.
 *
 *   Detailer → GC → Architect → EOR
 *
 * Stored on the submittal row:
 *   submittals.approval_chain       jsonb array of { party } step objects
 *   submittals.approval_chain_step  0-based index of the step currently
 *                                   holding the ball (null = no routing)
 *
 * The chain NEVER owns workflow truth — `submittals.status` does. The chain
 * only decides WHO is next (ball_in_court) while the submittal routes through
 * the IFA/OFA phase. Decisions (Approved / Approved as Noted / R&R / Rejected)
 * are still recorded with the existing status verbs, and stage derivation
 * stays in submittalStageMapping.js.
 *
 * Pure: no React, no Supabase, no side effects.
 */

/** Parties that count as "internal / detailing side" — routing out of these
 * is what flips a Draft to Submitted. Mirrors submittalStageMapping.js. */
export const DETAILER_CLASS_PARTIES = new Set([
  "Detailer", "S&H", "Contractor", "Subcontractor",
]);

/** Statuses during which advancing along the chain is meaningful. */
export const ROUTING_STATUSES = new Set(["Draft", "Submitted", "Under Review"]);

/** Built-in routes every project gets. Steel-typical handoffs. */
export const DEFAULT_CHAIN_TEMPLATES = [
  {
    key: "standard",
    name: "Standard — Detailer → GC → Architect → EOR",
    steps: ["Detailer", "GC", "Architect", "EOR"],
  },
  {
    key: "gc-eor",
    name: "GC review — Detailer → GC → EOR",
    steps: ["Detailer", "GC", "EOR"],
  },
  {
    key: "fast-track",
    name: "Fast-track — Detailer → EOR",
    steps: ["Detailer", "EOR"],
  },
];

/**
 * Normalize a raw chain value (jsonb from the DB, template steps, or user
 * input) into a clean array of `{ party }` objects. Accepts arrays of
 * strings or objects with a `party` field. Returns null when the input
 * yields no usable steps.
 */
export function normalizeChain(value) {
  if (!Array.isArray(value)) return null;
  const steps = value
    .map((entry) => {
      if (typeof entry === "string") return { party: entry.trim() };
      if (entry && typeof entry === "object" && typeof entry.party === "string") {
        return { party: entry.party.trim() };
      }
      return null;
    })
    .filter((step) => step && step.party);
  return steps.length > 0 ? steps : null;
}

/**
 * Merge built-in templates with any project-defined ones saved under
 * `projects.metadata.approval_chain_templates` (array of
 * `{ key?, name, steps }`). Project templates with unusable steps are
 * dropped; project templates win on key collisions.
 */
export function getChainTemplates(project) {
  const custom = [];
  const raw = project?.metadata?.approval_chain_templates;
  if (Array.isArray(raw)) {
    for (const tpl of raw) {
      const steps = normalizeChain(tpl?.steps);
      if (!steps) continue;
      custom.push({
        key: tpl.key || `custom-${custom.length + 1}`,
        name: tpl.name || steps.map((s) => s.party).join(" → "),
        steps: steps.map((s) => s.party),
        custom: true,
      });
    }
  }
  const customKeys = new Set(custom.map((t) => t.key));
  return [...custom, ...DEFAULT_CHAIN_TEMPLATES.filter((t) => !customKeys.has(t.key))];
}

/**
 * Derived chain state for a submittal. Always safe to call — returns
 * `{ steps: null }` when the submittal carries no usable chain.
 */
export function chainState(submittal) {
  const steps = normalizeChain(submittal?.approval_chain);
  if (!steps) {
    return { steps: null, stepIndex: null, currentParty: null, nextParty: null, atFinalStep: false };
  }
  const rawIndex = submittal?.approval_chain_step;
  const stepIndex =
    Number.isInteger(rawIndex) && rawIndex >= 0
      ? Math.min(rawIndex, steps.length - 1)
      : null;
  const currentParty = stepIndex != null ? steps[stepIndex].party : null;
  const nextParty =
    stepIndex != null && stepIndex < steps.length - 1 ? steps[stepIndex + 1].party : null;
  return {
    steps,
    stepIndex,
    currentParty,
    nextParty,
    atFinalStep: stepIndex != null && stepIndex === steps.length - 1,
  };
}

/** Index of the first step that is NOT detailing-side — the first outbound
 * hop. Falls back to the second step (or 0 for single-step chains). */
export function firstExternalStepIndex(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  const idx = steps.findIndex((s) => !DETAILER_CLASS_PARTIES.has(s.party));
  if (idx >= 0) return idx;
  return Math.min(1, steps.length - 1);
}

/**
 * Build the submittal patch that applies a routing template.
 *
 * Non-destructive: status is never touched. The current step aligns to the
 * party currently holding the ball when that party appears in the chain
 * (applying a route mid-flight), otherwise starts at step 0. ball_in_court
 * is only set when the submittal doesn't have one yet.
 */
export function buildApplyChainPatch(templateSteps, submittal) {
  const steps = normalizeChain(templateSteps);
  if (!steps) return null;
  const bic = submittal?.ball_in_court || null;
  const aligned = bic ? steps.findIndex((s) => s.party === bic) : -1;
  const stepIndex = aligned >= 0 ? aligned : 0;
  const patch = {
    approval_chain: steps,
    approval_chain_step: stepIndex,
  };
  if (!bic) patch.ball_in_court = steps[stepIndex].party;
  return patch;
}

/** Patch that removes routing from a submittal. */
export function buildClearChainPatch() {
  return { approval_chain: null, approval_chain_step: null };
}
