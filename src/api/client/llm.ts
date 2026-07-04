/**
 * llm.ts
 *
 * The Core.InvokeLLM implementation: the llm-proxy edge-function call with its
 * 3-tier retry / diagnosis flow and stale-deployment (protocol-version)
 * detection. Extracted verbatim from supabaseClient.ts; composed into
 * `integrations` by integrations.ts.
 */

import { supabase } from '@/lib/supabase';
import type { InvokeLLMArgs, InvokeLLMResult } from './supabaseTypes';

/**
 * Invoke the LLM via the "llm-proxy" Supabase Edge Function.
 *
 * Returns either { text, content, raw } on success or { error } on
 * failure. IMPORTANT: callers must inspect `result.error` before using
 * `result.text` — we never throw, so the upload modal can surface a
 * clean message on the fallback row instead of falling through to a
 * generic "AI response was not valid JSON" path.
 */
export const InvokeLLM = async ({ prompt, system, messages, response_json_schema, input_variables, maxTokens = 1000, model, file_urls, files, tools, tool_choice, temperature, provider = 'openai', useCase, project_id }: InvokeLLMArgs): Promise<InvokeLLMResult> => {
  // The client expects this protocol version from the edge function. If the
  // function returns a lower version (or no version field), the deployed
  // edge function is older than the codebase and needs to be redeployed:
  //   supabase functions deploy llm-proxy --no-verify-jwt
  // See supabase/functions/llm-proxy/index.ts (PROTOCOL_VERSION constant).
  //
  // v3 marks the deploy where verify_jwt was turned off on the function —
  // without that, every POST returns 401 at Supabase's gate before the
  // function code even runs. If you see protocol v2 or lower AND POSTs are
  // failing with 401, that's the smoking gun.
  const EXPECTED_PROTOCOL_VERSION = 3;

  // We track the FIRST real failure we see so that if every tier fails we
  // can surface a precise diagnosis instead of a generic "AI unavailable".
  let firstFailure: string | null = null;

  // ── 1. Try Supabase Edge Function (llm-proxy) ──────────────────────────
  try {
    const { data, error } = await supabase.functions.invoke('llm-proxy', {
      body: { provider, prompt, system, messages, response_json_schema, input_variables, maxTokens, model, file_urls, files, tools, tool_choice, temperature, useCase, project_id },
    });
    if (error) {
      let detail = error?.message || String(error);
      try {
        const ctx = (error as { context?: { text?: () => Promise<string> } })?.context;
        if (ctx && typeof ctx.text === 'function') {
          const body = await ctx.text();
          if (body) {
            try { detail = JSON.parse(body)?.error || body; } catch { detail = body; }
          }
        }
      } catch { /* ignore */ }
      firstFailure = `llm-proxy edge function failed: ${detail}`;
      console.warn('[llm-proxy]', firstFailure);
    } else if (data && typeof data === 'object' && (data as { error?: unknown }).error) {
      firstFailure = `llm-proxy returned error: ${(data as { error?: unknown }).error}`;
      console.warn('[llm-proxy]', firstFailure);
    } else if (data && typeof data === 'object') {
      // Detect a stale edge-function deployment. If the caller wants
      // structured output (passed `tools`) but the response has no
      // tool_use AND no protocol_version, the deployed function is
      // pre-tool-use and must be redeployed.
      const usedTools = Array.isArray(tools) && tools.length > 0;
      const d = data as { tool_use?: unknown; protocol_version?: unknown };
      const gotToolUse = d.tool_use && typeof d.tool_use === 'object';
      const reportedVersion = Number(d.protocol_version) || 0;
      if (usedTools && !gotToolUse && reportedVersion < EXPECTED_PROTOCOL_VERSION) {
        firstFailure =
          `llm-proxy deployed version is too old (got v${reportedVersion}, need v${EXPECTED_PROTOCOL_VERSION}). ` +
          `Tool-use extraction will not work until you redeploy the edge function: ` +
          `\`supabase functions deploy llm-proxy\``;
        console.warn('[llm-proxy]', firstFailure);
        // surface the stale-deploy error below — there is no client-side fallback
      } else {
        return data as InvokeLLMResult;
      }
    } else {
      firstFailure = 'llm-proxy returned no data';
      console.warn('[llm-proxy]', firstFailure);
    }
  } catch (proxyErr: unknown) {
    const msg = (proxyErr as { message?: string } | undefined)?.message ?? String(proxyErr);
    firstFailure = `llm-proxy threw: ${msg}`;
    console.warn('[llm-proxy]', firstFailure);
  }

  // ── 2. No LLM available — surface the REAL reason ─────────────────────
  // We deliberately do NOT default to a generic "AI unavailable" string
  // when we know what actually went wrong. The first real failure (proxy
  // error, schema problem, stale deployment) is far more actionable than
  // "deploy an edge function" advice.
  const finalMsg = firstFailure
    || 'AI unavailable. Deploy and configure the authenticated Supabase Edge Function named "llm-proxy".';
  console.warn('[InvokeLLM]', finalMsg);
  return { error: finalMsg };
};
