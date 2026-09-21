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
// Configured limits fail closed whenever usage cannot be verified. Routing
// labels supplied by a caller never weaken this boundary. Telemetry insertion
// remains best-effort, so this aggregate is not an atomic spend reservation.
//
// Secrets required (already present for telemetry):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// New optional secrets:
//   LLM_DAILY_COST_LIMIT_USD   (e.g. "5.00")
//   LLM_DAILY_REQUEST_LIMIT    (e.g. "200")
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000;
// Bound the pre-dispatch usage read so database outages return a retryable 503.
const READ_TIMEOUT_MS = 2000;

function numEnv(name: string): number {
  const raw = Deno.env.get(name);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : Number.NaN;
}

export interface QuotaDenied {
  ok: false;
  status: 429 | 503;
  error: string;
  retryAfterSeconds: number;
}
export type QuotaResult = { ok: true } | QuotaDenied;

function unavailable(): QuotaResult {
  return {
    ok: false,
    status: 503,
    error: "AI usage limits can't be verified right now. Please retry shortly.",
    retryAfterSeconds: 30,
  };
}

/**
 * Returns { ok: true } to proceed, or a QuotaDenied the caller renders as 429
 * (over limit) or 503 (cannot verify usage). Caller passes the
 * authenticated user id (from authenticateRequest).
 */
export async function checkUserQuota(userId: string): Promise<QuotaResult> {
  const costLimit = numEnv("LLM_DAILY_COST_LIMIT_USD");
  const reqLimit  = numEnv("LLM_DAILY_REQUEST_LIMIT");

  if (!Number.isFinite(costLimit) || !Number.isFinite(reqLimit)) return unavailable();

  // Both caps off → nothing to enforce. Skip the round trip entirely. (Nothing to
  // fail closed about — there is no configured limit to protect.)
  if (costLimit === 0 && reqLimit === 0) return { ok: true };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[llm-proxy] quota skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return unavailable();
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
      // A timeout also fails closed.
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.error(`[llm-proxy] quota read ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return unavailable();
    }

    // The TABLE-returning RPC yields a one-row array. numeric (cost_sum) is
    // serialized as a STRING by PostgREST to preserve precision; Number() coerces
    // both it and the bigint count.
    const rows = (await resp.json()) as Array<{ request_count: number | string; cost_sum: number | string | null }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || row.request_count == null || row.cost_sum == null) return unavailable();
    const requestCount = Number(row.request_count);
    const costSum = Number(row.cost_sum);
    if (!Number.isFinite(requestCount) || requestCount < 0 || !Number.isFinite(costSum) || costSum < 0) return unavailable();

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
    return unavailable();
  }
}
