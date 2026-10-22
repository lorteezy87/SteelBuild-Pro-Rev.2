/**
 * transmittalWrites — the one write path for drawing transmittals.
 *
 * Two surfaces log and edit transmittals: the hub's TransmittalLogPanel and
 * the Document Control Board Report. Each used to be a candidate for its own
 * inline `entities.DrawingTransmittal.*` calls, which is how two writers drift
 * (CLAUDE.md, "One write path" under Schedule tasks). Both call these instead.
 *
 * Rules these functions hold so callers cannot get them wrong:
 * - Every sheet target is resolved BEFORE the header is written. A target
 *   that cannot name its drawing throws first, so a bad pick never leaves a
 *   header with half its items.
 * - `drawing_transmittal_items_one_target` requires exactly one of
 *   drawing_id / gc_drawing_id, so every item carries drawing_id alongside
 *   drawing_revision_id.
 * - Delete is SOFT (`is_deleted`), so the audit history survives.
 * - An item with no revision recorded was never offered in a picker, so an
 *   edit never removes it.
 */

import { entities } from "@/api/supabaseClient";
import { withProjectId } from "@/lib/mutations/standardMutation";

export interface TransmittalTarget {
  revisionId: string;
  drawingId: string;
}

export interface TransmittalItemLike {
  id: string;
  drawing_revision_id: string | null;
}

/** Header columns a caller may write. Unknown keys are the caller's bug, not passed through. */
export interface TransmittalHeader {
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
  received_from?: string | null;
  sent_to?: string | null;
  recipient_company?: string | null;
  purpose?: string | null;
  subject?: string | null;
  date_sent?: string | null;
  date_received?: string | null;
  notes?: string | null;
}

function requireNumber(header: TransmittalHeader): void {
  if (!header.transmittal_number?.trim()) throw new Error("Transmittal number is required");
}

/**
 * Resolve picked revision ids to item targets. Throws on the first revision
 * the options cannot tie to a drawing — before anything is written.
 */
export function resolveTransmittalTargets(
  revisionIds: Iterable<string>,
  drawingIdForRevision: (revisionId: string) => string | null | undefined,
): TransmittalTarget[] {
  return [...revisionIds].map((revisionId) => {
    const drawingId = drawingIdForRevision(revisionId);
    if (!drawingId) throw new Error(`Revision ${revisionId} is not linked to a drawing.`);
    return { revisionId, drawingId };
  });
}

function createItem(projectId: string | null, transmittalId: string, target: TransmittalTarget) {
  return entities.DrawingTransmittalItem.create(
    withProjectId(
      {
        transmittal_id: transmittalId,
        drawing_revision_id: target.revisionId,
        drawing_id: target.drawingId,
      },
      projectId,
    ) as never,
  );
}

/** Log a new transmittal and its sheet items. Returns the created header. */
export async function createTransmittal(
  projectId: string | null,
  header: TransmittalHeader,
  targets: TransmittalTarget[],
): Promise<Record<string, unknown>> {
  requireNumber(header);
  const transmittal = (await entities.DrawingTransmittal.create(
    withProjectId({ ...header } as Record<string, unknown>, projectId) as never,
  )) as Record<string, unknown> & { id: string };
  for (const target of targets) {
    await createItem(projectId, transmittal.id, target);
  }
  return transmittal;
}

/**
 * Update a header and reconcile its items against the picked revisions:
 * add what is newly picked, remove what was un-picked, leave the rest.
 */
export async function updateTransmittal(
  projectId: string | null,
  transmittal: { id: string; items: TransmittalItemLike[] },
  header: TransmittalHeader,
  pickedRevisionIds: Set<string>,
  drawingIdForRevision: (revisionId: string) => string | null | undefined,
): Promise<void> {
  if (!projectId) throw new Error("Select a project before editing a transmittal");
  requireNumber(header);

  const existing = new Set(
    transmittal.items.flatMap((item) => (item.drawing_revision_id ? [item.drawing_revision_id] : [])),
  );
  const additions = resolveTransmittalTargets(
    [...pickedRevisionIds].filter((revisionId) => !existing.has(revisionId)),
    drawingIdForRevision,
  );
  const removals = transmittal.items.filter(
    (item) => item.drawing_revision_id && !pickedRevisionIds.has(item.drawing_revision_id),
  );

  await entities.DrawingTransmittal.update(transmittal.id, { ...header } as never);
  await Promise.all([
    ...additions.map((target) => createItem(projectId, transmittal.id, target)),
    ...removals.map((item) => entities.DrawingTransmittalItem.delete(item.id)),
  ]);
}

/** Soft delete. The header and its items stay in the database for audit. */
export async function softDeleteTransmittal(id: string): Promise<void> {
  await entities.DrawingTransmittal.update(id, { is_deleted: true } as never);
}

export interface TransmittalAcknowledgement {
  /** Who confirmed receipt — a person at the recipient, not the signed-in user. */
  by: string;
  /** ISO timestamp of the confirmation. */
  at: string;
  notes?: string | null;
}

/**
 * Record that the recipient confirmed receipt. The name is required: an
 * acknowledgement nobody can attribute is not evidence of receipt.
 */
export async function recordTransmittalAcknowledgement(
  id: string,
  ack: TransmittalAcknowledgement,
): Promise<void> {
  const by = ack.by.trim();
  if (!by) throw new Error("Name who acknowledged receipt");
  if (Number.isNaN(Date.parse(ack.at))) throw new Error("Acknowledgement date is not a valid date");
  await entities.DrawingTransmittal.update(id, {
    acknowledged_at: ack.at,
    acknowledged_by_name: by,
    acknowledged_notes: ack.notes?.trim() || null,
  } as never);
}

/** Undo a mis-recorded acknowledgement, returning the transmittal to "awaiting". */
export async function clearTransmittalAcknowledgement(id: string): Promise<void> {
  await entities.DrawingTransmittal.update(id, {
    acknowledged_at: null,
    acknowledged_by_name: null,
    acknowledged_notes: null,
  } as never);
}
