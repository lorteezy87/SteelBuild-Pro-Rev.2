// ─────────────────────────────────────────────────────────────────────────────
// llm-proxy — Supabase Edge Function
//
// Multi-provider LLM gateway. Accepts Anthropic-style request shape
// (document blocks, tool definitions, system prompt) and dispatches to a
// provider client based on:
//
//   1. explicit `provider` + `model` in the body                  (override)
//   2. `useCase` lookup against router.ts                         (default)
//   3. fallback to "general" routing target                       (safety net)
//
// EXTERNAL WIRE FORMAT IS UNCHANGED.
//
// Existing callers continue to work without code changes — they get the
// same `{ text, content, tool_use, raw, protocol_version }` envelope.
// The `useCase` parameter is OPTIONAL.
//
// Telemetry: every call (success or failure) is best-effort logged to
// public.llm_telemetry. Logging failures NEVER fail the user-facing
// response — they go to console.error and we move on.
//
// Request body:
//   {
//     useCase?:     string                   // routing key (default "general")
//     provider?:    "anthropic" | "openai"   // explicit override
//     prompt?:      string
//     system?:      string
//     messages?:    Array<{role, content}>
//     maxTokens?:   number
//     model?:       string                   // explicit override
//     temperature?: number
//     tools?:       Anthropic-style tool definitions
//     tool_choice?: Anthropic-style tool-choice
//     project_id?:  string                   // for telemetry only
//   }
//
// Response envelope (UNCHANGED — DO NOT BREAK):
//   {
//     text:     string,
//     content:  string,
//     tool_use: { name, input } | null,
//     raw:      object,
//     protocol_version: number,
//   }
//
// Secrets required (Supabase → Project Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (the last is for telemetry inserts).
//
// Optional secrets:
//   ALLOWED_ORIGINS            — CORS lockdown (OPT-IN). Unset or "*" → permissive.
//                                Set to comma-separated real origins to enforce
//                                (baked prod defaults + localhost + *.vercel.app
//                                are always allowed alongside the configured ones).
//   LLM_KILL_SWITCH            — "1"/"true" halts ALL LLM calls (break-glass).
//   LLM_DAILY_COST_LIMIT_USD   — per-user rolling-24h spend cap (see quota.ts).
//   LLM_DAILY_REQUEST_LIMIT    — per-user rolling-24h request cap.
//
// Deploy:
//   supabase functions deploy llm-proxy --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { LLMResponse, ProviderClient } from "./providers/types.ts";
import { LLMError } from "./providers/types.ts";
import { anthropicClient } from "./providers/anthropic.ts";
import { openaiClient }    from "./providers/openai.ts";
import { computeCostUsd, isModelPriced } from "./providers/cost.ts";
import { getProviderForUseCase } from "./router.ts";
import { checkUserQuota } from "./quota.ts";

// Protocol versions:
//   v3 = verify_jwt disabled
//   v4 = structured logging + friendlier error surfaces
//   v5 = pre-v6 deploy baseline
//   v6 = v5 + protocol_version returned on every error too
//   v7 = multi-provider (anthropic/openai)
//   v8 = use-case routing + telemetry. Wire shape unchanged from v7.
const PROTOCOL_VERSION = 8;

const PROVIDER_REGISTRY: Record<string, ProviderClient> = {
  anthropic: anthropicClient,
  openai:    openaiClient,
};

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

// Use-cases that send large document/image inputs (high per-call cost). For
// these the quota check fails CLOSED when usage can't be verified, so a usage-
// read outage can't be exploited to bypass the spend cap on the costly calls.
// Cheap chat/extraction calls stay fail-open (telemetry never breaks the request).
const EXPENSIVE_USE_CASES = new Set([
  "drawing-analysis",
  "revision-compare",
  "sheet-extraction",
  "photo-ocr",
  "shipping-ticket-import",
  "rfi-log-import",
]);

// CORS is OPT-IN: permissive ("*") unless ALLOWED_ORIGINS is explicitly set to
// real origins (non-"*"). A too-narrow baked default once silently blocked AI
// calls (the preflight echoed a non-matching origin → the browser dropped the
// POST), so the default stays permissive. Set ALLOWED_ORIGINS to lock down.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://steelbuild-pro.com",
  "https://www.steelbuild-pro.com",
];

// Explicit non-"*" origins from env — additions to the baked defaults.
function envOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return [];
  return raw.split(",").map((o) => o.trim()).filter((o) => o && o !== "*");
}

function corsLockedDown(): boolean {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  return !!raw && raw.trim() !== "*";
}

function corsHeaders(req?: Request): Record<string, string> {
  // Permissive unless explicitly locked down (and for response helpers with no
  // req). The preflight, which has the req, is where a locked-down config gates
  // cross-origin browsers.
  if (!req || !corsLockedDown()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sentry-trace, baggage",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }

  const origin = req.headers.get("Origin") || "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
  // Disallowed origin → fall back to the canonical production origin so the
  // browser's preflight fails (origin mismatch) and the request is blocked.
  const allowOrigin = DEFAULT_ALLOWED_ORIGINS.includes(origin) || envOrigins().includes(origin) || isLocalhost || isVercelPreview
    ? origin
    : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sentry-trace, baggage",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function authenticateRequest(req: Request): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: json({ error: "Unauthorized - valid Bearer JWT required", protocol_version: PROTOCOL_VERSION }, 401, req),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnon) {
    console.error("[llm-proxy] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return {
      ok: false,
      response: json({ error: "Edge function auth is not configured", protocol_version: PROTOCOL_VERSION }, 500, req),
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": supabaseAnon,
      },
    });

    if (!userResp.ok) {
      const errBody = await userResp.text();
      console.error(`[llm-proxy] Auth /user returned ${userResp.status}: ${errBody.slice(0, 200)}`);
      return {
        ok: false,
        response: json({ error: "Invalid or expired session", protocol_version: PROTOCOL_VERSION }, 401, req),
      };
    }

    const user = await userResp.json();
    if (!user?.id) {
      return {
        ok: false,
        response: json({ error: "Invalid session - no user returned", protocol_version: PROTOCOL_VERSION }, 401, req),
      };
    }
    return { ok: true, userId: user.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[llm-proxy] Auth /user fetch threw:", msg);
    return {
      ok: false,
      response: json({ error: `Auth service unreachable: ${msg}`, protocol_version: PROTOCOL_VERSION }, 502, req),
    };
  }
}

// ─── Telemetry ──────────────────────────────────────────────────────────────

interface TelemetryRow {
  use_case:      string;
  provider:      string;
  model:         string;
  user_id:       string | null;
  project_id:    string | null;
  input_tokens:  number | null;
  output_tokens: number | null;
  cost_usd:      number | null;
  latency_ms:    number;
  success:       boolean;
  error_kind:    string | null;
  metadata:      Record<string, unknown>;
}

/**
 * Best-effort insert into llm_telemetry. NEVER throws — a logging
 * failure must not bubble up and break the caller's request. We use
 * the service-role key so RLS doesn't block the insert.
 */
async function recordTelemetry(row: TelemetryRow): Promise<void> {
  const supabaseUrl  = Deno.env.get("SUPABASE_URL");
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[llm-proxy] telemetry skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return;
  }
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/llm_telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey":       serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer":       "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      console.error(`[llm-proxy] telemetry insert ${resp.status}: ${detail}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[llm-proxy] telemetry insert threw: ${msg}`);
  }
}

// ─── Wire-format translator ─────────────────────────────────────────────────

/**
 * Translate the internal `LLMResponse` into the v7-compatible wire
 * envelope. EVERY existing caller depends on this exact shape, so DO
 * NOT add or rename keys here without bumping PROTOCOL_VERSION and
 * coordinating with `src/api/supabaseClient.ts`.
 */
function toWireEnvelope(resp: LLMResponse): Record<string, unknown> {
  return {
    text:     resp.text,
    content:  resp.text,        // legacy alias — still emitted
    tool_use: resp.toolUse,
    raw:      resp.raw,
    protocol_version: PROTOCOL_VERSION,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")    return json({ error: "Method not allowed", protocol_version: PROTOCOL_VERSION }, 405, req);

  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  // Global kill switch — break-glass to halt ALL LLM spend without a redeploy.
  if (isTruthy(Deno.env.get("LLM_KILL_SWITCH"))) {
    return json(
      { error: "AI features are temporarily disabled. Please try again later.", protocol_version: PROTOCOL_VERSION },
      503,
      req,
    );
  }

  // NOTE: the per-user spend/volume quota is checked AFTER the routing decision
  // (below), so it can fail CLOSED for expensive use-cases. Body parse + routing
  // are cheap; the provider call (the thing being gated) is still well after it.

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return json(
      { error: `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`, protocol_version: PROTOCOL_VERSION },
      400,
    );
  }

  // ── Routing decision ────────────────────────────────────────────────────
  // Order of precedence:
  //   1. Explicit body.provider AND body.model → caller knows what it wants.
  //   2. Explicit body.provider only           → use router model for that provider's use case (rare).
  //   3. body.useCase                          → router lookup.
  //   4. neither                               → "general" default.
  const useCase = typeof body?.useCase === "string" && body.useCase
    ? body.useCase
    : "general";

  const routed = getProviderForUseCase(useCase);

  const explicitProvider = typeof body?.provider === "string" && body.provider
    ? String(body.provider).toLowerCase()
    : null;
  const explicitModel = typeof body?.model === "string" && body.model
    ? String(body.model)
    : null;

  const provider = explicitProvider || routed.provider;
  const model    = explicitModel    || routed.model;

  const client = PROVIDER_REGISTRY[provider];
  if (!client) {
    return json(
      { error: `Unknown provider: "${provider}". Use "anthropic" or "openai".`, protocol_version: PROTOCOL_VERSION },
      400,
    );
  }

  // ── Model allowlist (cost + abuse control) ──────────────────────────────
  // Callers may override provider/model (above), so gate the RESOLVED model to
  // the rate card: allowed ≡ priced. Without this an unpriced/expensive model
  // could be requested directly and would log cost_usd = NULL, silently escaping
  // spend tracking. To allow a model, price it in providers/cost.ts.
  if (!isModelPriced(provider, model)) {
    return json(
      { error: `Model not allowed: "${provider}/${model}". The gateway only serves models priced in its rate card.`, protocol_version: PROTOCOL_VERSION },
      400,
      req,
    );
  }

  // ── Clamp output tokens (cost/abuse control) ────────────────────────────
  // maxTokens is the main lever on a single call's output cost; clamp a
  // caller-supplied value to a ceiling generous enough for every real caller
  // (observed max is 8000 across extraction/import/copilot) yet tight enough
  // that one request can't run away. Refine per-useCase here if ever needed.
  const OUTPUT_TOKEN_CEILING = 16000;
  if (typeof body?.maxTokens === "number" && body.maxTokens > OUTPUT_TOKEN_CEILING) {
    console.warn(`[llm-proxy] clamping maxTokens ${body.maxTokens} -> ${OUTPUT_TOKEN_CEILING} (useCase=${useCase})`);
    body.maxTokens = OUTPUT_TOKEN_CEILING;
  }

  // ── Per-user daily spend/volume guard ───────────────────────────────────
  // No-op unless a cap secret is set. Now that the use-case is known, expensive
  // (document/image) use-cases fail CLOSED if usage can't be verified; cheap
  // calls stay fail-open. Checked before the provider call so a throttled user
  // never reaches a provider.
  const quota = await checkUserQuota(auth.userId, { failClosed: EXPENSIVE_USE_CASES.has(useCase) });
  if (!quota.ok) {
    const res = json({ error: quota.error, protocol_version: PROTOCOL_VERSION }, quota.status, req);
    res.headers.set("Retry-After", String(quota.retryAfterSeconds));
    return res;
  }

  // ── Diagnostic log (matches v7 format so existing log searches keep working)
  try {
    const msgCount = Array.isArray(body?.messages) ? body.messages.length : 0;
    const toolCount = Array.isArray(body?.tools) ? body.tools.length : 0;
    let contentBlocks = 0;
    let docBytes = 0;
    const firstMsg = body?.messages?.[0];
    if (Array.isArray(firstMsg?.content)) {
      contentBlocks = firstMsg.content.length;
      for (const b of firstMsg.content) {
        if (b?.type === "document" && typeof b?.source?.data === "string") {
          docBytes += b.source.data.length;
        }
      }
    }
    console.log(
      `[llm-proxy] useCase=${useCase} provider=${provider} model=${model} ` +
      `maxTokens=${body?.maxTokens || "default"} msgs=${msgCount} blocks=${contentBlocks} ` +
      `tools=${toolCount} docB64Bytes=${docBytes} ` +
      `explicit=${explicitProvider ? "provider" : ""}${explicitModel ? "+model" : ""}`,
    );
  } catch (e) {
    console.log("[llm-proxy] pre-dispatch log failed:", (e as Error)?.message);
  }

  // ── Provider call (timed) ──────────────────────────────────────────────
  const t0 = performance.now();
  const projectId = typeof body?.project_id === "string" && body.project_id
    ? body.project_id
    : null;

  try {
    const result = await client.call(body, { model });
    const latencyMs = Math.round(performance.now() - t0);

    // Best-effort telemetry. Don't await before responding to the user
    // beyond the insert itself — the row is small.
    await recordTelemetry({
      use_case:      useCase,
      provider,
      model,
      user_id:       auth.userId,
      project_id:    projectId,
      input_tokens:  result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd:      computeCostUsd(provider, model, result.inputTokens, result.outputTokens),
      latency_ms:    latencyMs,
      success:       true,
      error_kind:    null,
      metadata:      {
        explicit_provider: !!explicitProvider,
        explicit_model:    !!explicitModel,
        had_tools:         Array.isArray(body?.tools) && body.tools.length > 0,
      },
    });

    return json(toWireEnvelope(result));
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const isLLMError = err instanceof LLMError;
    const status     = isLLMError ? (err as LLMError).status   : 500;
    const errorKind  = isLLMError ? (err as LLMError).errorKind : "internal_error";
    const message    = err instanceof Error ? err.message : String(err);

    // Telemetry on the failure path too — without this, error rate
    // dashboards would only ever see successes.
    await recordTelemetry({
      use_case:      useCase,
      provider,
      model,
      user_id:       auth.userId,
      project_id:    projectId,
      input_tokens:  null,
      output_tokens: null,
      cost_usd:      null,
      latency_ms:    latencyMs,
      success:       false,
      error_kind:    errorKind,
      metadata:      {
        explicit_provider: !!explicitProvider,
        explicit_model:    !!explicitModel,
        status,
      },
    });

    if (!isLLMError) {
      const name = err instanceof Error ? err.name : "Error";
      const stack = err instanceof Error && err.stack
        ? err.stack.split("\n").slice(0, 5).join(" | ")
        : null;
      console.error(`[llm-proxy] ${provider} handler threw: ${name}: ${message}${stack ? " stack: " + stack : ""}`);
    }

    return json(
      { error: `${provider} handler: ${message}`, protocol_version: PROTOCOL_VERSION },
      status,
    );
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : null;
    // Log the stack server-side only — do NOT return it to the client (it can
    // disclose internal file paths / structure). Surface a generic message.
    console.error(`[llm-proxy] Unhandled ${name}: ${message}`, stack || "");
    return json(
      {
        error: `Unhandled ${name}: ${message}`,
        protocol_version: PROTOCOL_VERSION,
      },
      500,
    );
  }
});
