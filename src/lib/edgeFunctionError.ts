/**
 * supabase-js wraps any non-2xx Edge Function response in a `FunctionsHttpError`
 * whose `.message` is the generic "Edge Function returned a non-2xx status code".
 * The function's own JSON body (its error code, detail, and any extra fields)
 * lives only on `error.context`, the raw `Response`. Returns that body, or null
 * when there is no readable JSON object (network errors, non-JSON bodies, or a
 * body that was already consumed).
 */
export async function readEdgeFunctionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null | undefined)?.context;
  if (!ctx || typeof ctx.json !== "function") return null;
  try {
    const body = await ctx.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
