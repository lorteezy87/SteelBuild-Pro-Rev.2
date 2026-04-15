// ─────────────────────────────────────────────────────────────────────────────
// llm-proxy — Supabase Edge Function
//
// Thin server-side proxy that forwards chat-completion-style requests to the
// Anthropic Messages API. Keeps ANTHROPIC_API_KEY out of the browser.
//
// Request body:
//   {
//     prompt?:       string                // user message (ignored if messages given)
//     system?:       string                // system prompt
//     messages?:     Array<{role,content}> // full Anthropic messages array
//     maxTokens?:    number                // default 1000
//     model?:        string                // default claude-sonnet-4-5
//     temperature?:  number                // default 1.0 (Anthropic default)
//     tools?:        Array<ToolDef>        // Anthropic tool-use definitions
//     tool_choice?:  object                // { type: "tool", name: "..." } to force
//     file_urls?:    string[]              // ACCEPTED but IGNORED — callers should
//                                           // inline PDF text into the prompt
//   }
//
// Response body (success):
//   {
//     text:     string,       // first text block (or stringified tool input if tools used)
//     content:  string,       // same as text (legacy alias)
//     tool_use: object | null,// first tool_use block's { name, input } if present
//     raw:      object,       // full Anthropic response
//   }
//
// Response body (error):
//   { error: string }
//
// Set ANTHROPIC_API_KEY in Supabase → Project Settings → Edge Functions → Secrets.
// Deploy via: supabase functions deploy llm-proxy   (or Supabase MCP).
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Bump this whenever the edge function's request/response contract changes.
// Clients use it to detect a stale deployment — if the client expects v2 and
// the edge function returns v1 (or no version at all), the client knows the
// function needs to be redeployed via `supabase functions deploy llm-proxy`.
//   v1 = original text-only proxy
//   v2 = added tools / tool_choice / temperature pass-through and tool_use
//        parsing in the response
const PROTOCOL_VERSION = 2;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!ANTHROPIC_API_KEY) {
    return json(
      {
        error:
          "ANTHROPIC_API_KEY not configured. Add it in Supabase → Project Settings → Edge Functions → Secrets.",
      },
      500,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    prompt,
    system,
    messages,
    maxTokens = 1000,
    model = DEFAULT_MODEL,
    temperature,
    tools,
    tool_choice,
  } = body ?? {};

  const msgs = Array.isArray(messages) && messages.length > 0
    ? messages
    : [{ role: "user", content: String(prompt ?? "") }];

  const payload: Record<string, unknown> = {
    model,
    max_tokens: Number(maxTokens) || 1000,
    messages: msgs,
  };
  if (system) payload.system = String(system);
  if (typeof temperature === "number" && Number.isFinite(temperature)) {
    payload.temperature = temperature;
  }
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    // Default to forcing the first named tool when the caller sends tools
    // but no explicit choice — most of our callers want structured output,
    // not a chat response.
    if (tool_choice) {
      payload.tool_choice = tool_choice;
    } else if (tools[0]?.name) {
      payload.tool_choice = { type: "tool", name: tools[0].name };
    }
  }

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json(
      { error: `Anthropic fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return json(
      { error: `Anthropic API ${resp.status}: ${errText}` },
      resp.status,
    );
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    return json({ error: "Anthropic returned non-JSON" }, 502);
  }

  // Anthropic returns content as an array of blocks. Each block is either a
  // text block ({ type: "text", text }) or a tool_use block ({ type:
  // "tool_use", name, input }). For structured extraction we prefer tool_use;
  // for plain chat we fall back to text.
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

  // When a tool was called, surface its JSON-stringified input as `text` so
  // callers that use the legacy string-return path still work.
  const textOut = firstToolUse
    ? JSON.stringify(firstToolUse.input)
    : firstText;

  return json({
    text:     textOut,
    content:  textOut,
    tool_use: firstToolUse,
    raw:      data,
    protocol_version: PROTOCOL_VERSION,
  });
});
