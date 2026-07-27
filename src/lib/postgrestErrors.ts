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

/** Missing table/view/column in schema cache (migration lag). */
export function isMissingSchemaObjectError(error: unknown): boolean {
  const code = postgrestErrorCode(error);
  if (code === "PGRST205" || code === "PGRST204") return true;
  const message = postgrestErrorMessage(error);
  return /schema cache|Could not find the table|does not exist|column .* does not exist/i.test(
    message,
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
