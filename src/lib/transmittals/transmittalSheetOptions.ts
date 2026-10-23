/**
 * The sheet picker behind a transmittal editor, keyed by revision.
 *
 * Current revisions come from the register; an edit adds back any revision
 * the transmittal already carries that is no longer current, marked
 * `historical`, so un-ticking it is a deliberate act rather than a silent
 * drop. Moved out of TransmittalLogPanel so the Board Report's editor offers
 * exactly the same list.
 */

import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { TransmittalAttachment } from "@/hooks/useTransmittals";

export interface SheetOption {
  revisionId: string;
  drawingId: string | null;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revisionCode: string | null;
  historical: boolean;
}

export function buildSheetOptions(
  register: DrawingRegisterRow[],
  attachedItems: TransmittalAttachment[],
): SheetOption[] {
  const byRevision = new Map<string, SheetOption>();
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
    // The picker is keyed by revision; an item with none recorded can't be listed.
    const revisionId = item.drawing_revision_id;
    if (!revisionId || byRevision.has(revisionId)) continue;
    byRevision.set(revisionId, {
      revisionId,
      drawingId: item.drawing_id,
      sheetNumber: item.sheet_number,
      sheetTitle: item.sheet_title,
      revisionCode: item.revision_code,
      historical: true,
    });
  }
  return [...byRevision.values()].sort((a, b) =>
    String(a.sheetNumber || "").localeCompare(String(b.sheetNumber || ""), undefined, { numeric: true })
    || String(a.revisionCode || "").localeCompare(String(b.revisionCode || ""), undefined, { numeric: true }),
  );
}

/** The drawing a picked revision belongs to, or null when the options cannot say. */
export function drawingIdForRevisionOption(options: SheetOption[], revisionId: string): string | null {
  return options.find((option) => option.revisionId === revisionId)?.drawingId ?? null;
}
