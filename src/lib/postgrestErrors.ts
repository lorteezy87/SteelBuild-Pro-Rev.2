/**
 * PostgREST / Supabase error helpers shared by soft-fail enrichment paths.
 */

export type PostgrestErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
};

function asRecord(error: unknown): PostgrestErrorLike | null {
  if (!error || typeof error !== "object") return null;
  return error as PostgrestErrorLike;
}

export function postgrestErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  const record = asRecord(error);
  if (!record) return "";
  return [record.message, record.details, record.hint, record.code]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" — ");
}

export function postgrestErrorCode(error: unknown): string {
  const record = asRecord(error);
  if (record && typeof record.code === "string") return record.code;
  if (error instanceof Error) {
    const tagged = error.message.match(/\b(PGRST\d+)\b/i);
    if (tagged) return tagged[1].toUpperCase();
  }
  const message = postgrestErrorMessage(error);
  const fromMessage = message.match(/\b(PGRST\d+)\b/i);
  return fromMessage ? fromMessage[1].toUpperCase() : "";
}

/** Missing table/view/column/function in schema cache (migration lag). */
export function isMissingSchemaObjectError(error: unknown): boolean {
  const code = postgrestErrorCode(error);
  // PGRST202 = missing function; PGRST204 = missing column; PGRST205 = missing table/view.
  if (code === "PGRST202" || code === "PGRST205" || code === "PGRST204") return true;
  const message = postgrestErrorMessage(error);
  return /schema cache|Could not find the (table|function)|does not exist|column .* does not exist/i.test(
    message,
  );
}

/**
 * Name the missing object from a schema-cache error, e.g.
 * "titleblock_revision_rect on drawing_sets" or "apply_project_template".
 * Returns "" when the message doesn't identify one.
 */
export function describeMissingSchemaObject(error: unknown): string {
  const message = postgrestErrorMessage(error);
  if (!message) return "";
  const column = message.match(/find the '([^']+)' column of '([^']+)'/i);
  if (column) return `${column[1]} on ${column[2]}`;
  const table = message.match(/find the table '([^']+)'/i);
  if (table) return table[1].replace(/^public\./, "");
  const fn = message.match(/find the function ([^\s(]+)/i);
  if (fn) return fn[1].replace(/^public\./, "");
  const bareColumn = message.match(/column "?([\w.]+)"? does not exist/i);
  if (bareColumn) return bareColumn[1];
  return "";
}

/**
 * End-user copy for migration lag. The raw PostgREST text ("Could not find the
 * 'x' column of 'y' in the schema cache") was surfacing straight into save
 * toasts, where it reads as a crash and tells the user nothing they can act on.
 * The operator-facing detail still reaches Sentry via normalizeThrownQueryError.
 */
export function missingSchemaObjectUserMessage(error: unknown): string {
  const what = describeMissingSchemaObject(error);
  return (
    "This feature needs a pending database update" +
    (what ? ` (${what})` : "") +
    ". An admin needs to apply the latest migrations — your work was not saved."
  );
}

/**
 * Turn plain PostgREST `{ code, message, ... }` objects into real Errors so
 * react-query / Sentry / presenters keep the operator-facing message.
 */
export function normalizeThrownQueryError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = postgrestErrorMessage(error) || "Query failed";
  const normalized = new Error(message);
  const record = asRecord(error);
  if (record) {
    Object.assign(normalized, {
      code: record.code,
      details: record.details,
      hint: record.hint,
      status:
        typeof record.status === "number"
          ? record.status
          : isMissingSchemaObjectError(error)
            ? 404
            : undefined,
    });
  }
  return normalized;
}
