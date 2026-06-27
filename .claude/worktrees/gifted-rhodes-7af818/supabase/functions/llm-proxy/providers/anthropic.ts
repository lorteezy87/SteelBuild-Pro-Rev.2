// providers/anthropic.ts
//
// Anthropic Messages API client. Wraps the body of the previous
// `callAnthropic()` function from index.ts. The wire-format response
// translation now lives in index.ts; this client only deals in the
// internal `LLMResponse` shape.

// deno-lint-ignore-file no-explicit-any

import type { LLMRequest, LLMResponse, ProviderClient } from "./types.ts";
import { LLMError } from "./types.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

export const anthropicClient: ProviderClient = {
  name: "anthropic",

  async call(req: LLMRequest, opts: { model: string }): Promise<LLMResponse> {
    if (!ANTHROPIC_API_KEY) {
      throw new LLMError(
        "ANTHROPIC_API_KEY not configured. Add it in Supabase → Project Settings → Edge Functions → Secrets.",
        500,
        "missing_api_key",
      );
    }

    const {
      prompt,
      system,
      messages,
      maxTokens = 1000,
      temperature,
      tools,
      tool_choice,
    } = req;

    const msgs = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: "user", content: String(prompt ?? "") }];

    const payload: Record<string, unknown> = {
      model: opts.model,
      max_tokens: Number(maxTokens) || 1000,
      messages: msgs,
    };
    if (system) payload.system = String(system);
    if (typeof temperature === "number" && Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      if (tool_choice) {
        payload.tool_choice = tool_choice;
      } else if (tools[0]?.name) {
        // Mirror the v7 default: when tools are passed without an
        // explicit tool_choice, force the first tool. Most callers want
        // structured output, not a chat response.
        payload.tool_choice = { type: "tool", name: tools[0].name };
      }
    }

    let resp: Response;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-api-key":        ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new LLMError(
        `Anthropic fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
        "network_error",
      );
    }

    const rawText = await resp.text();
    if (!resp.ok) {
      throw new LLMError(
        `Anthropic API ${resp.status}: ${rawText}`,
        resp.status,
        // 429 → rate_limit, 401/403 → auth_error, 5xx → upstream_5xx,
        // anything else → upstream_4xx. Coarse but enough to spot a
        // sudden auth-key revocation vs Anthropic capacity issues.
        resp.status === 429 ? "rate_limit"
          : resp.status === 401 || resp.status === 403 ? "auth_error"
          : resp.status >= 500 ? "upstream_5xx"
          : "upstream_4xx",
      );
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      throw new LLMError(
        `Anthropic returned non-JSON: ${err instanceof Error ? err.message : String(err)}. Body head: ${rawText.slice(0, 200)}`,
        502,
        "parse_error",
      );
    }

    let firstText = "";
    let firstToolUse: { name: string; input: unknown } | null = null;
    if (Array.isArray(data?.content)) {
      for (const block of data.content) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "tool_use" && !firstToolUse) {
          firstToolUse = { name: block.name, input: block.input };
        } else if (block.type === "text" && !firstText && typeof block.text === "string") {
          firstText = block.text;
        }
      }
    } else if (typeof data?.content === "string") {
      firstText = data.content;
    }

    const textOut = firstToolUse ? JSON.stringify(firstToolUse.input) : firstText;

    return {
      text: textOut,
      toolUse: firstToolUse,
      raw: data,
      model: opts.model,
      // Anthropic returns usage as { input_tokens, output_tokens } —
      // both are integers when present.
      inputTokens:  Number.isFinite(data?.usage?.input_tokens)  ? data.usage.input_tokens  : null,
      outputTokens: Number.isFinite(data?.usage?.output_tokens) ? data.usage.output_tokens : null,
    };
  },
};
