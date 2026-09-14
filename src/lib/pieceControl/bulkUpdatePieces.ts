/**
 * Client helpers for allowlisted piece attribute bulk updates.
 * work_package_id is intentionally excluded — use assign/unassign RPCs.
 */

export type BulkPieceAttributePatch = {
  sequence_number?: string | null;
  erection_area?: string | null;
};

export type BulkPieceAttributePlan = {
  patch: BulkPieceAttributePatch;
  fields: Array<keyof BulkPieceAttributePatch>;
};

/**
 * Build a fail-closed patch from optional form values.
 * Empty strings clear the field (null). Omitted/unchanged fields are skipped.
 */
export function planBulkPieceAttributeUpdate(input: {
  sequenceNumber?: string | null;
  erectionArea?: string | null;
  updateSequence: boolean;
  updateArea: boolean;
}): BulkPieceAttributePlan {
  const patch: BulkPieceAttributePatch = {};
  const fields: Array<keyof BulkPieceAttributePatch> = [];

  if (input.updateSequence) {
    const raw = input.sequenceNumber ?? "";
    patch.sequence_number = String(raw).trim() === "" ? null : String(raw).trim();
    fields.push("sequence_number");
  }
  if (input.updateArea) {
    const raw = input.erectionArea ?? "";
    patch.erection_area = String(raw).trim() === "" ? null : String(raw).trim();
    fields.push("erection_area");
  }

  return { patch, fields };
}
