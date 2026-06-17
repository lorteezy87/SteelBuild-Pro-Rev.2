/**
 * rfiDownstream — given an answered RFI, decide which downstream "apply the
 * answer" actions to surface (slice 4 of the RFI workflow backbone). Pure, no
 * I/O: the actual navigation / mutation is performed by the caller, so this
 * stays unit-testable and the detail modal stays presentational.
 *
 * The whole point of the panel: an answered RFI almost never ends at "answered".
 * It usually forces a drawing revision, a change order, a freed work package, a
 * field heads-up, or a new constraint. Rather than make the PM remember to go do
 * each of those by hand, we read the RFI's own impact flags + links and offer
 * the relevant next steps in one place. Nothing is auto-applied (CLAUDE.md §17)
 * — every action is a one-click hand-off the user confirms.
 */

export type DownstreamActionKey =
  | "create_co"
  | "update_drawing"
  | "open_wp"
  | "notify_field"
  | "add_constraint";

export interface DownstreamAction {
  key: DownstreamActionKey;
  label: string;
  /** design-system Icon name, or undefined for no icon. */
  icon?: string;
  /** Highlighted as the primary recommended step. */
  primary?: boolean;
  /** Short "why this is suggested" line shown under the label. */
  hint: string;
}

/** True once an RFI carries an answer (explicit text or Answered/Closed status). */
export function isAnswered(rfi: Record<string, any> | null | undefined): boolean {
  if (!rfi) return false;
  return Boolean(rfi.answer) || ["Answered", "Closed"].includes(rfi.status);
}

/**
 * Build the ordered list of downstream actions for an answered RFI. Empty until
 * the RFI is answered. Order = consequence: change order first (when flagged),
 * then drawing, work package, and the always-available field + constraint
 * hand-offs.
 */
export function recommendedDownstreamActions(
  rfi: Record<string, any> | null | undefined,
): DownstreamAction[] {
  if (!isAnswered(rfi) || !rfi) return [];
  const m = rfi.metadata || {};
  const actions: DownstreamAction[] = [];

  // Change order — the most consequential follow-up, so it leads when flagged.
  if (rfi.cost_impact || m.change_order_likely) {
    actions.push({
      key: "create_co",
      label: "Create change order",
      primary: true,
      hint: rfi.cost_impact ? "Cost impact recorded" : "Marked change-order likely",
    });
  }

  // Drawing revision — the answer changes the documents.
  if (m.drawing_revision_required || rfi.drawing_reference || rfi.drawing_set_id) {
    actions.push({
      key: "update_drawing",
      label: "Update linked drawing",
      icon: "drawings",
      primary: Boolean(m.drawing_revision_required),
      hint: m.drawing_revision_required
        ? "Drawing revision required"
        : rfi.drawing_reference
          ? `Linked to ${rfi.drawing_reference}`
          : "Linked drawing set",
    });
  }

  // Work package — the answer may unblock fabrication/erection scope.
  if (rfi.work_package_id) {
    actions.push({
      key: "open_wp",
      label: "Open work package",
      hint: m.fab_hold ? "Was on fab hold" : "Linked work package",
    });
  }

  // Field heads-up — always offered on an answered RFI. This is the one real
  // mutation (posts a field alert); the rest are navigations.
  actions.push({
    key: "notify_field",
    label: "Notify field",
    icon: "bell",
    hint: "Post a field alert with the answer",
  });

  // Constraint — capture any residual blocker the answer introduced.
  actions.push({
    key: "add_constraint",
    label: "Log constraint",
    hint: "Track a remaining blocker",
  });

  return actions;
}
