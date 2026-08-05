/**
 * Pure sheet option merge for TransmittalLogPanel.
 */
export type SheetOptionLike = {
  revisionId: string;
  drawingId: string;
  sheetNumber?: string | null;
  sheetTitle?: string | null;
  revisionCode?: string | null;
  historical: boolean;
};

export function buildSheetOptions(
  register: any[],
  attachedItems: any[],
): SheetOptionLike[] {
  const byRevision = new Map<string, SheetOptionLike>();
  for (const row of register) {
    if (!row.current_revision_id) continue;
    byRevision.set(row.current_revision_id, {
      revisionId: row.current_revision_id,
      drawingId: row.drawing_id,
      sheetNumber: row.sheet_number,
      sheetTitle: row.sheet_title,
      revisionCode: row.current_revision,
      historical: false,
    });
  }
  for (const item of attachedItems) {
    if (byRevision.has(item.drawing_revision_id)) continue;
    byRevision.set(item.drawing_revision_id, {
      revisionId: item.drawing_revision_id,
      drawingId: item.drawing_id,
      sheetNumber: item.sheet_number,
      sheetTitle: item.sheet_title,
      revisionCode: item.revision_code,
      historical: true,
    });
  }
  return [...byRevision.values()].sort(
    (a, b) =>
      String(a.sheetNumber || "").localeCompare(String(b.sheetNumber || ""), undefined, {
        numeric: true,
      }) ||
      String(a.revisionCode || "").localeCompare(String(b.revisionCode || ""), undefined, {
        numeric: true,
      }),
  );
}

export type DirectionPillTone = "info" | "good" | "neutral";

export function directionTone(direction: string): DirectionPillTone {
  if (direction === "incoming") return "info";
  if (direction === "outgoing") return "good";
  return "neutral";
}

export type TransmittalFormState = {
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
  party: string;
  subject: string;
  date: string;
  notes: string;
};

export function formForTransmittal(
  transmittal: any,
  resolveDisplay: (t: any) => { party?: string | null; date?: string | null },
): TransmittalFormState {
  const { party, date } = resolveDisplay(transmittal);
  return {
    transmittal_number: transmittal.transmittal_number,
    direction: transmittal.direction,
    party: party || "",
    subject: transmittal.subject || "",
    date: date ? String(date).slice(0, 10) : "",
    notes: transmittal.notes || "",
  };
}

export function headerPatch(form: TransmittalFormState) {
  const incoming = form.direction === "incoming";
  return {
    transmittal_number: form.transmittal_number.trim(),
    direction: form.direction,
    received_from: incoming ? form.party.trim() || null : null,
    sent_to: incoming ? null : form.party.trim() || null,
    subject: form.subject.trim() || null,
    date_sent: incoming ? null : form.date || null,
    date_received: incoming ? form.date || null : null,
    notes: form.notes.trim() || null,
  };
}

export const EMPTY_TRANSMITTAL_FORM = {
  transmittal_number: "",
  direction: "incoming",
  party: "",
  subject: "",
  date: "",
  notes: "",
} as const;

