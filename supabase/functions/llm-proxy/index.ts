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
// Deploy:
//   supabase functions deploy llm-proxy --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { LLMResponse, ProviderClient } from "./providers/types.ts";
import { LLMError } from "./providers/types.ts";
import { anthropicClient } from "./providers/anthropic.ts";
import { openaiClient }    from "./providers/openai.ts";
import { computeCostUsd }  from "./providers/cost.ts";
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

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(req?: Request): Record<string, string> {
  const configured = allowedOrigins();
  if (!req || configured.length === 0 || configured.includes("*")) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sentry-trace, baggage",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }

  const origin = req?.headers.get("Origin") || "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = configured.includes(origin) || isLocalhost ? origin : "null";
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

  // Per-user daily spend/volume guard. No-op unless a cap secret is set; fails
  // OPEN on any read error (see quota.ts). Checked before body parse/dispatch so
  // a throttled user never reaches a provider call.
  const quota = await checkUserQuota(auth.userId);
  if (!quota.ok) {
    const res = json({ error: quota.error, protocol_version: PROTOCOL_VERSION }, quota.status, req);
    res.headers.set("Retry-After", String(quota.retryAfterSeconds));
    return res;
  }

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
