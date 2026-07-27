/**
 * Map Project Closeout UI fields ↔ project_closeout columns.
 * Unsupported UI extras (invoices / permits / handover) live in metadata.
 */

export type CloseoutUiFields = {
  closeout_status?: string;
  completion_date?: string | null;
  handover_date?: string | null;
  final_inspection_completed?: boolean;
  punch_list_cleared?: boolean;
  all_invoices_processed?: boolean;
  warranties_registered?: boolean;
  as_built_docs_completed?: boolean;
  permits_closed?: boolean;
  manuals_complete?: boolean;
  notes?: string | null;
};

export type CloseoutDbRow = {
  id?: string;
  project_id?: string;
  project_name?: string | null;
  status?: string | null;
  closeout_date?: string | null;
  as_built_complete?: boolean | null;
  manuals_complete?: boolean | null;
  warranties_complete?: boolean | null;
  punchlist_complete?: boolean | null;
  final_inspection_date?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function metaOf(row: CloseoutDbRow | null | undefined): Record<string, unknown> {
  const metadata = row?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
}

/** Present a DB row in the UI field vocabulary used by closeout components. */
export function presentCloseoutForUi(row: CloseoutDbRow | null | undefined): CloseoutDbRow & CloseoutUiFields {
  if (!row) return {} as CloseoutDbRow & CloseoutUiFields;
  const metadata = metaOf(row);
  return {
    ...row,
    closeout_status: row.status ?? "In Progress",
    completion_date: row.closeout_date ?? null,
    handover_date: (metadata.handover_date as string | undefined) ?? null,
    final_inspection_completed: Boolean(row.final_inspection_date),
    punch_list_cleared: Boolean(row.punchlist_complete),
    warranties_registered: Boolean(row.warranties_complete),
    as_built_docs_completed: Boolean(row.as_built_complete),
    manuals_complete: Boolean(row.manuals_complete),
    all_invoices_processed: Boolean(metadata.all_invoices_processed),
    permits_closed: Boolean(metadata.permits_closed),
  };
}

/**
 * Convert a UI create/update patch into real project_closeout columns.
 * Merges metadata extras onto the existing metadata object when provided.
 */
export function buildCloseoutDbPayload(
  ui: CloseoutUiFields,
  existing?: CloseoutDbRow | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const metadata = metaOf(existing);
  let metadataTouched = false;

  if (ui.closeout_status !== undefined) payload.status = ui.closeout_status || "In Progress";
  if (ui.completion_date !== undefined) payload.closeout_date = ui.completion_date || null;
  if (ui.notes !== undefined) payload.notes = ui.notes || null;
  if (ui.punch_list_cleared !== undefined) payload.punchlist_complete = Boolean(ui.punch_list_cleared);
  if (ui.warranties_registered !== undefined) payload.warranties_complete = Boolean(ui.warranties_registered);
  if (ui.as_built_docs_completed !== undefined) payload.as_built_complete = Boolean(ui.as_built_docs_completed);
  if (ui.manuals_complete !== undefined) payload.manuals_complete = Boolean(ui.manuals_complete);

  if (ui.final_inspection_completed !== undefined) {
    if (ui.final_inspection_completed) {
      payload.final_inspection_date = existing?.final_inspection_date || todayIsoDate();
    } else {
      payload.final_inspection_date = null;
    }
  }

  if (ui.handover_date !== undefined) {
    metadata.handover_date = ui.handover_date || null;
    metadataTouched = true;
  }
  if (ui.all_invoices_processed !== undefined) {
    metadata.all_invoices_processed = Boolean(ui.all_invoices_processed);
    metadataTouched = true;
  }
  if (ui.permits_closed !== undefined) {
    metadata.permits_closed = Boolean(ui.permits_closed);
    metadataTouched = true;
  }

  if (metadataTouched) payload.metadata = metadata;
  return payload;
}
