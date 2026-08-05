/**
 * errors.ts
 *
 * SupabaseOperationError — wraps a Supabase error with table/operation context.
 * Extracted verbatim from supabaseClient.ts.
 */

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  code?: string;
  hint?: string;
  status?: number;
};

/**
 * Wrap a Supabase error with context about which table/operation failed.
 */
export class SupabaseOperationError extends Error {
  table: string;
  operation: string;
  code: string | undefined;
  details: string | undefined;
  hint: string | undefined;
  status: number | null;

  constructor(table: string, operation: string, originalError: SupabaseErrorLike | unknown) {
    const orig = (originalError ?? {}) as SupabaseErrorLike;
    const msg = orig.message || orig.details || String(originalError);
    super(`[${table}.${operation}] ${msg}`);
    this.name = 'SupabaseOperationError';
    this.table = table;
    this.operation = operation;
    this.code = orig.code;
    this.details = orig.details;
    this.hint = orig.hint;
    // Propagate HTTP status for smart retry logic (400 = bad column, 404 = missing table)
    // PGRST204 = missing column in schema cache; PGRST205 = missing table/view.
    this.status = orig.code === 'PGRST204' || orig.code === 'PGRST205' ? 404
      : /schema cache|Could not find the table|does not exist/i.test(msg) ? 404
      : orig.status ?? null;
  }
}
