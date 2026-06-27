// providers/openai.ts
//
// OpenAI Chat Completions client. Internalizes the Anthropic→OpenAI
// request adapter and OpenAI→Anthropic response adapter that previously
// lived at the top of index.ts. This keeps every "speaks OpenAI"
// concern inside one file so a future Phase-2 provider (Gemini Flash,
// xAI Grok, etc.) can copy this template without spelunking through
// index.ts.

// deno-lint-ignore-file no-explicit-any

import type { LLMRequest, LLMResponse, ProviderClient } from "./types.ts";
import { LLMError } from "./types.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// ─── Adapters: Anthropic content blocks → OpenAI content blocks ─────────────

function anthropicContentToOpenAI(block: any, fallbackFilename = "document.pdf"): any {
  if (!block || typeof block !== "object") return null;
  if (block.type === "text") {
    return { type: "text", text: String(block.text ?? "") };
  }
  if (block.type === "document") {
    const src = block.source || {};
    if (src.type === "base64" && typeof src.data === "string") {
      const media = src.media_type || "application/pdf";
      return {
        type: "file",
        file: {
          file_data: `data:${media};base64,${src.data}`,
          filename:  block.filename || fallbackFilename,
        },
      };
    }
    return null;
  }
  if (block.type === "image") {
    const src = block.source || {};
    if (src.type === "base64" && typeof src.data === "string") {
      const media = src.media_type || "image/png";
      return {
        type: "image_url",
        image_url: { url: `data:${media};base64,${src.data}` },
      };
    }
    if (src.type === "url" && typeof src.url === "string") {
      return { type: "image_url", image_url: { url: src.url } };
    }
    return null;
  }
  return null;
}

function anthropicMessagesToOpenAI(messages: any[], system?: string): any[] {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: String(system) });

  for (const m of messages || []) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : "user";

    if (typeof m.content === "string") {
      out.push({ role, content: m.content });
      continue;
    }

    if (!Array.isArray(m.content)) continue;
    const blocks: any[] = [];
    for (const block of m.content) {
      const converted = anthropicContentToOpenAI(block);
      if (converted) blocks.push(converted);
    }
    if (blocks.length === 1 && blocks[0].type === "text") {
      out.push({ role, content: blocks[0].text });
    } else if (blocks.length > 0) {
      out.push({ role, content: blocks });
    }
  }
  return out;
}

function anthropicToolsToOpenAI(tools: any[]): any[] {
  return (tools || []).map((t) => ({
    type: "function",
    function: {
      name:        t.name,
      description: t.description || "",
      parameters:  t.input_schema || { type: "object" },
    },
  }));
}

function anthropicToolChoiceToOpenAI(choice: any, firstToolName?: string): any {
  if (!choice) {
    return firstToolName
      ? { type: "function", function: { name: firstToolName } }
      : undefined;
  }
  if (choice.type === "tool" && typeof choice.name === "string") {
    return { type: "function", function: { name: choice.name } };
  }
  if (choice.type === "any")  return "required";
  if (choice.type === "auto") return "auto";
  return undefined;
}

// ─── Provider client ─────────────────────────────────────────────────────────

export const openaiClient: ProviderClient = {
  name: "openai",

  async call(req: LLMRequest, opts: { model: string }): Promise<LLMResponse> {
    if (!OPENAI_API_KEY) {
      throw new LLMError(
        "OPENAI_API_KEY not configured. Add it in Supabase → Project Settings → Edge Functions → Secrets.",
        500,
        "missing_api_key",
      );
    }

    const {
      system,
      messages,
      maxTokens = 1000,
      temperature,
      tools,
      tool_choice,
      prompt,
    } = req;

    const inputMessages =
      Array.isArray(messages) && messages.length > 0
        ? messages
        : [{ role: "user", content: String(prompt ?? "") }];

    const openaiMessages = anthropicMessagesToOpenAI(inputMessages as any[], system);
    const openaiTools = Array.isArray(tools) && tools.length > 0
      ? anthropicToolsToOpenAI(tools as any[])
      : undefined;
    const openaiToolChoice = openaiTools
      ? anthropicToolChoiceToOpenAI(tool_choice, (tools as any[])?.[0]?.name)
      : undefined;

    const payload: Record<string, unknown> = {
      model: opts.model,
      messages: openaiMessages,
      max_tokens: Number(maxTokens) || 1000,
    };
    if (typeof temperature === "number" && Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }
    if (openaiTools) {
      payload.tools = openaiTools;
      if (openaiToolChoice) payload.tool_choice = openaiToolChoice;
    }

    let resp: Response;
    try {
      resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new LLMError(
        `OpenAI fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
        "network_error",
      );
    }

    const rawText = await resp.text();
    if (!resp.ok) {
      throw new LLMError(
        `OpenAI API ${resp.status}: ${rawText}`,
        resp.status,
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
        `OpenAI returned non-JSON: ${err instanceof Error ? err.message : String(err)}. Body head: ${rawText.slice(0, 200)}`,
        502,
        "parse_error",
      );
    }

    const choice = data?.choices?.[0];
    const messageObj = choice?.message || {};
    let firstText = "";
    let firstToolUse: { name: string; input: unknown } | null = null;

    const toolCall = Array.isArray(messageObj.tool_calls) ? messageObj.tool_calls[0] : null;
    if (toolCall?.function?.name) {
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        parsedInput = toolCall.function.arguments;
      }
      firstToolUse = { name: toolCall.function.name, input: parsedInput };
    }
    if (typeof messageObj.content === "string" && messageObj.content) {
      firstText = messageObj.content;
    } else if (Array.isArray(messageObj.content)) {
      for (const part of messageObj.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          firstText = part.text;
          break;
        }
      }
    }

    const textOut = firstToolUse ? JSON.stringify(firstToolUse.input) : firstText;

    return {
      text: textOut,
      toolUse: firstToolUse,
      raw: data,
      model: opts.model,
      // OpenAI returns usage as { prompt_tokens, completion_tokens, total_tokens }.
      inputTokens:  Number.isFinite(data?.usage?.prompt_tokens)     ? data.usage.prompt_tokens     : null,
      outputTokens: Number.isFinite(data?.usage?.completion_tokens) ? data.usage.completion_tokens : null,
    };
  },
};
