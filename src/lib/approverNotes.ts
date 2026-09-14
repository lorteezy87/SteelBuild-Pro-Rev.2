/**
 * approverNotes.ts — questions for EOR/AOR on a submittal package.
 *
 * Approver Notes are questions the shop / detailer / PM sends with the
 * package. Approver Response is the EOR/AOR answer. Any note with no
 * response flags the submittal Incomplete — Pending EOR/AOR Response.
 *
 * Pure: no React, no Supabase, no clock.
 */

export const PENDING_EOR_AOR_FLAG = "Pending EOR/AOR Response";
export const INCOMPLETE_EOR_AOR_LABEL = "Incomplete — Pending EOR/AOR Response";

export interface ApproverNote {
  id: string;
  note: string;
  response: string;
  created_at?: string | null;
  responded_at?: string | null;
}

export interface ApproverNotesStatus {
  notes: ApproverNote[];
  unanswered: ApproverNote[];
  unansweredCount: number;
  complete: boolean;
  flag: typeof PENDING_EOR_AOR_FLAG | null;
  label: typeof INCOMPLETE_EOR_AOR_LABEL | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export function newApproverNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `an-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeApproverNote(raw: unknown, index = 0): ApproverNote | null {
  if (typeof raw === "string") {
    const note = raw.trim();
    if (!note) return null;
    return { id: `legacy-${index}`, note, response: "" };
  }
  if (!isRecord(raw)) return null;
  const note = text(raw.note ?? raw.note_text ?? raw.question ?? raw.text).trim();
  const response = text(raw.response ?? raw.response_text ?? raw.answer).trim();
  if (!note && !response) return null;
  const id = text(raw.id).trim() || `an-${index}`;
  return {
    id,
    note,
    response,
    created_at: text(raw.created_at) || null,
    responded_at: text(raw.responded_at) || null,
  };
}

/**
 * Accept the first-class column, metadata.approver_notes, or a JSON string.
 */
export function parseApproverNotes(raw: unknown): ApproverNote[] {
  if (raw == null || raw === "") return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [{ id: "legacy-0", note: trimmed, response: "" }];
    }
  }
  if (isRecord(value) && Array.isArray(value.approver_notes)) {
    value = value.approver_notes;
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => normalizeApproverNote(row, index))
    .filter((row): row is ApproverNote => !!row);
}

export function readApproverNotes(submittal: unknown): ApproverNote[] {
  if (!isRecord(submittal)) return [];
  const direct = parseApproverNotes(submittal.approver_notes);
  if (direct.length > 0) return direct;
  return parseApproverNotes(isRecord(submittal.metadata) ? submittal.metadata.approver_notes : null);
}

export function isApproverNoteUnanswered(note: ApproverNote | null | undefined): boolean {
  if (!note) return false;
  return note.note.trim().length > 0 && note.response.trim().length === 0;
}

export function collectUnansweredApproverNotes(
  notes: ApproverNote[] | null | undefined,
): ApproverNote[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter(isApproverNoteUnanswered);
}

export function hasUnansweredApproverNotes(source: unknown): boolean {
  const notes = Array.isArray(source) ? parseApproverNotes(source) : readApproverNotes(source);
  return collectUnansweredApproverNotes(notes).length > 0;
}

export function evaluateApproverNotes(source: unknown): ApproverNotesStatus {
  const notes = Array.isArray(source) ? parseApproverNotes(source) : readApproverNotes(source);
  const unanswered = collectUnansweredApproverNotes(notes);
  const incomplete = unanswered.length > 0;
  return {
    notes,
    unanswered,
    unansweredCount: unanswered.length,
    complete: !incomplete,
    flag: incomplete ? PENDING_EOR_AOR_FLAG : null,
    label: incomplete ? INCOMPLETE_EOR_AOR_LABEL : null,
  };
}

export function serializeApproverNotes(notes: ApproverNote[] | null | undefined): ApproverNote[] {
  return (Array.isArray(notes) ? notes : [])
    .map((row, index) => normalizeApproverNote(row, index))
    .filter((row): row is ApproverNote => !!row)
    .filter((row) => row.note.trim().length > 0 || row.response.trim().length > 0)
    .map((row) => ({
      id: row.id,
      note: row.note.trim(),
      response: row.response.trim(),
      created_at: row.created_at ?? null,
      responded_at: row.response.trim() ? row.responded_at ?? null : null,
    }));
}
