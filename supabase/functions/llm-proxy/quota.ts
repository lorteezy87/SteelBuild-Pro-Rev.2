// ─────────────────────────────────────────────────────────────────────────────
// quota.ts — per-user spend/volume guard for llm-proxy
//
// Calls the public.get_llm_usage_window aggregate (service-role key, same path
// as recordTelemetry) for the authenticated user's rolling 24h window and blocks
// the request if either:
//
//   • summed cost_usd  >= LLM_DAILY_COST_LIMIT_USD   (spend cap — the real guard)
//   • row count        >= LLM_DAILY_REQUEST_LIMIT    (volume cap — abuse/runaway)
//
// The aggregate is computed SERVER-SIDE (one indexed query → { request_count,
// cost_sum }) rather than fetching every telemetry row and summing here, which
// would be subject to PostgREST's row cap and silently undercount the spend at
// scale. The supporting index + SECURITY DEFINER function ship in migration
// 20260619020000_llm_quota_usage_window.sql.
//
// Either dimension is DISABLED when its env var is unset or <= 0, so you can ship
// with just a cost cap, just a request cap, or both.
//
// Failure policy: PER-CALL. If the usage read errors (Supabase REST hiccup,
// missing env, migration not yet applied → 404) we either ALLOW (fail-open) or
// DENY with 503 (fail-closed) depending on the caller's `failClosed` flag — set
// for expensive document/image use-cases so a usage-read outage can't be used to
// bypass the spend cap on the costly calls, while cheap calls keep the codebase's
// "telemetry never breaks the user-facing request" rule. The over-limit verdict
// is always a 429. The window is rolling, not calendar-day, so no reset cliff.
//
// Secrets required (already present for telemetry):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// New optional secrets:
//   LLM_DAILY_COST_LIMIT_USD   (e.g. "5.00")
//   LLM_DAILY_REQUEST_LIMIT    (e.g. "200")
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000;
// This read sits on the PRE-DISPATCH hot path of every llm-proxy request, so it
// must be bounded: fail-open covers errors/non-2xx, but NOT a hung connection
// (PgBouncer/PostgREST stall). A short deadline turns a stall into a fast
// fail-open instead of hanging the user's LLM call.
const READ_TIMEOUT_MS = 2000;

function numEnv(name: string): number {
  const raw = Deno.env.get(name);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface QuotaDenied {
  ok: false;
  status: 429 | 503;
  error: string;
  retryAfterSeconds: number;
}
export type QuotaResult = { ok: true } | QuotaDenied;

export interface QuotaOptions {
  /**
   * When true, an INABILITY TO VERIFY usage (config missing, REST error, timeout)
   * denies the request (503) instead of failing open. Set for expensive use-cases
   * (document/image extraction) so a usage-read outage can't be used to bypass the
   * spend cap on the costly calls. Cheap calls stay fail-open so a telemetry hiccup
   * never breaks the everyday user-facing request.
   */
  failClosed?: boolean;
}

/**
 * The usage read couldn't produce a verdict. Fail OPEN for cheap calls (the
 * codebase's "telemetry never breaks the request" rule); fail CLOSED (503) when
 * the caller flagged this as an expensive use-case.
 */
function unavailable(failClosed?: boolean): QuotaResult {
  if (!failClosed) return { ok: true };
  return {
    ok: false,
    status: 503,
    error: "AI usage limits can't be verified right now. Please retry shortly.",
    retryAfterSeconds: 30,
  };
}

/**
 * Returns { ok: true } to proceed, or a QuotaDenied the caller renders as 429
 * (over limit) or 503 (can't verify + failClosed). Caller passes the
 * authenticated user id (from authenticateRequest).
 */
export async function checkUserQuota(userId: string, opts: QuotaOptions = {}): Promise<QuotaResult> {
  const costLimit = numEnv("LLM_DAILY_COST_LIMIT_USD");
  const reqLimit  = numEnv("LLM_DAILY_REQUEST_LIMIT");

  // Both caps off → nothing to enforce. Skip the round trip entirely. (Nothing to
  // fail closed about — there is no configured limit to protect.)
  if (costLimit === 0 && reqLimit === 0) return { ok: true };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[llm-proxy] quota skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return unavailable(opts.failClosed);
  }

  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_llm_usage_window`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_since: sinceIso }),
      // Bound the hot-path read; an AbortError (timeout) lands in the catch → fail-open.
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.error(`[llm-proxy] quota read ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return unavailable(opts.failClosed);
    }

    // The TABLE-returning RPC yields a one-row array. numeric (cost_sum) is
    // serialized as a STRING by PostgREST to preserve precision; Number() coerces
    // both it and the bigint count.
    const rows = (await resp.json()) as Array<{ request_count: number | string; cost_sum: number | string | null }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    const requestCount = Number(row?.request_count) || 0;
    const costSum      = Number(row?.cost_sum) || 0;

    const overCost = costLimit > 0 && costSum >= costLimit;
    const overReq  = reqLimit  > 0 && requestCount >= reqLimit;

    if (overCost || overReq) {
      // Keep the configured cap (the denominator) in the SERVER log only — the
      // client-facing message stays generic so an end user can't read off the
      // exact throttle threshold and pace requests just under it.
      const detail = overCost
        ? `cost $${costSum.toFixed(4)} >= cap $${costLimit.toFixed(2)}`
        : `reqs ${requestCount} >= cap ${reqLimit}`;
      console.warn(`[llm-proxy] quota BLOCK user=${userId} ${detail}`);
      return {
        ok: false,
        status: 429,
        error: "Daily AI usage limit reached. Resets within 24h.",
        retryAfterSeconds: 3600, // coarse; the window is rolling
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[llm-proxy] quota check threw: ${msg}`);
    return unavailable(opts.failClosed);
  }
}
