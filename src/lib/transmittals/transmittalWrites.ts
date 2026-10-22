/**
 * transmittalWrites — the write paths for drawing transmittals.
 *
 * TWO KINDS OF WRITE, AND WHICH IS WHICH MATTERS.
 * `drawing_transmittals` carries the shared database's lifecycle
 * (SteelBuild-Pro-2026's m4_1): draft → sent → acknowledged, or → void. Its
 * PM-gated RPCs own every transition and the snapshot taken at send:
 * `create_transmittal` (number from the sequence, draft, items),
 * `send_transmittal` (freezes number/revision/title per item, stamps the
 * sender), `acknowledge_transmittal` (sent → acknowledged, a name required)
 * and `void_transmittal` (the only retraction of a sent one, a reason
 * required). `set_transmittal_items` refuses once sent: items are frozen.
 *
 * - The lifecycle functions below (`createAndSendTransmittal`,
 *   `acknowledgeTransmittal`, `voidTransmittal`) call those RPCs and are the
 *   only way to issue, confirm or withdraw a transmittal. The Board Report
 *   uses them and nothing else.
 * - The direct header/item writes (`createTransmittal`, `updateTransmittal`,
 *   `softDeleteTransmittal`) are the hub log's pre-existing editor, kept
 *   byte-for-byte in behaviour. A direct insert lands as a draft.
 *
 * Rules the direct writes hold:
 * - Every sheet target is resolved BEFORE the header is written, so a bad
 *   pick never leaves a header with half its items.
 * - `drawing_transmittal_items_one_target` requires exactly one of
 *   drawing_id / gc_drawing_id, so every item carries drawing_id.
 * - Delete is SOFT (`is_deleted`), so the audit history survives.
 * - An item with no revision recorded was never offered in a picker, so an
 *   edit never removes it.
 */

import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
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

/* ─── lifecycle (RPC) ────────────────────────────────────────────────────── */

type TransmittalRecord = Record<string, unknown> & { id: string; transmittal_number?: string; status?: string };

async function rpc(name: string, args: Record<string, unknown>): Promise<TransmittalRecord> {
  // The generated Database type lists these functions; the client's rpc
  // overloads do not narrow well through a dynamic name, hence the cast.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
  if (error) throw new Error(error.message);
  return data as TransmittalRecord;
}

const isCalendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export interface NewTransmittal {
  subject: string;
  /** Who it goes to — `send_transmittal` refuses without one. */
  sentTo: string;
  recipientCompany?: string | null;
  purpose?: string | null;
  notes?: string | null;
  /** Shop drawings to issue. `send_transmittal` refuses an empty transmittal. */
  drawingIds: string[];
  /** Calendar date sent, YYYY-MM-DD. A `date` argument, so no time zone can move it. */
  sentDate: string;
}

/**
 * Issue a transmittal: create the draft (the number comes from the project
 * sequence, never from the client) and send it, which snapshots every sheet's
 * number, revision and title as issued.
 *
 * The RPC's own preconditions are checked first so the common refusals never
 * reach the database. If the send still fails, the orphan draft is voided so
 * the log is not left holding an unsent, invisible record, and the error says
 * what happened to its number.
 */
export async function createAndSendTransmittal(projectId: string, input: NewTransmittal): Promise<TransmittalRecord> {
  const subject = input.subject.trim();
  const sentTo = input.sentTo.trim();
  const drawingIds = [...new Set(input.drawingIds.filter(Boolean))];
  if (!subject) throw new Error("A transmittal needs a subject");
  if (!sentTo) throw new Error("Record who the transmittal goes to before sending");
  if (drawingIds.length === 0) throw new Error("Add at least one drawing before sending");
  if (!isCalendarDate(input.sentDate)) throw new Error("Date sent is not a valid date");

  const draft = await rpc("create_transmittal", {
    p_project_id: projectId,
    p_payload: {
      direction: "outgoing",
      subject,
      sent_to: sentTo,
      recipient_company: input.recipientCompany?.trim() || null,
      purpose: input.purpose?.trim() || null,
      notes: input.notes?.trim() || null,
      item_refs: drawingIds.map((id) => `shop:${id}`),
    },
  });

  try {
    return await rpc("send_transmittal", { p_transmittal_id: draft.id, p_sent_date: input.sentDate });
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : String(sendError);
    try {
      await rpc("void_transmittal", { p_transmittal_id: draft.id, p_reason: `Send failed: ${reason}` });
    } catch {
      throw new Error(`${draft.transmittal_number ?? "The transmittal"} was created as a draft but not sent (${reason}), and could not be voided. Void it from the transmittal log.`);
    }
    throw new Error(`Not sent: ${reason}. ${draft.transmittal_number ?? "The draft"} was voided.`);
  }
}

export interface TransmittalAcknowledgement {
  /** Who confirmed receipt — a person at the recipient, not the signed-in user. */
  by: string;
  /** Calendar date of receipt, YYYY-MM-DD. */
  date: string;
  notes?: string | null;
}

/**
 * The calendar day as a timestamp that reads back as the same day everywhere.
 * Stored timestamptz comes back in UTC and the Board reads its date prefix,
 * so UTC noon is the day itself; local noon was a day off in UTC±12..14.
 */
export function acknowledgementInstant(date: string): string {
  if (!isCalendarDate(date)) throw new Error("Acknowledgement date is not a valid date");
  return `${date}T12:00:00Z`;
}

/** sent → acknowledged. A name is required: an unattributed receipt is not evidence. */
export async function acknowledgeTransmittal(id: string, ack: TransmittalAcknowledgement): Promise<TransmittalRecord> {
  const by = ack.by.trim();
  if (!by) throw new Error("Record who acknowledged receipt");
  return rpc("acknowledge_transmittal", {
    p_transmittal_id: id,
    p_by_name: by,
    p_notes: ack.notes?.trim() || null,
    p_at: acknowledgementInstant(ack.date),
  });
}

/** Withdraw an issued transmittal. The record and its snapshot are kept; a reason is required. */
export async function voidTransmittal(id: string, reason: string): Promise<TransmittalRecord> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A void reason is required");
  return rpc("void_transmittal", { p_transmittal_id: id, p_reason: trimmed });
}
