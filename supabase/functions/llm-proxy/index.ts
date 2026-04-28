// ─────────────────────────────────────────────────────────────────────────────
// llm-proxy — Supabase Edge Function
//
// Multi-provider LLM proxy. Accepts Anthropic-style request shape (document
// blocks, tool definitions, system prompt) and routes to:
//
//   provider: "anthropic"  → Anthropic Messages API            (default)
//   provider: "openai"     → OpenAI Chat Completions API       (cheaper)
//
// The response shape is always the Anthropic-compatible envelope, so client
// code doesn't have to branch on which provider ran the request.
//
// Request body:
//   {
//     provider?:    "anthropic" | "openai"   // default "anthropic"
//     prompt?:      string                   // legacy single-message input
//     system?:      string
//     messages?:    Array<{role, content}>   // Anthropic-style content blocks
//     maxTokens?:   number
//     model?:       string
//     temperature?: number
//     tools?:       Anthropic-style tool definitions
//     tool_choice?: Anthropic-style tool-choice
//   }
//
// Response envelope:
//   {
//     text:     string,        // first text block, OR stringified tool input
//     content:  string,        // legacy alias
//     tool_use: { name, input } | null,
//     raw:      object,        // raw upstream response
//     protocol_version: number,
//   }
//
// Secrets required (Supabase → Project Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — for the Anthropic path
//   OPENAI_API_KEY     — for the OpenAI path
//
// Deploy:
//   supabase functions deploy llm-proxy --no-verify-jwt
//   (or via the Supabase MCP deploy_edge_function tool with verify_jwt:false)
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY");
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_OPENAI_MODEL    = "gpt-4o-mini";

// Protocol version bumps when the request/response contract changes.
//   v3 = verify_jwt disabled
//   v4 = structured logging + friendlier error surfaces
//   v5 = pre-v6 deploy baseline
//   v6 = v5 + protocol_version returned on every error too
//   v7 = multi-provider: accepts provider:"openai" and transforms to/from the
//        OpenAI Chat Completions shape.
const PROTOCOL_VERSION = 7;

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
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }

  const origin = req?.headers.get("Origin") || "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = configured.includes(origin) || isLocalhost ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// ─── OpenAI adapters ─────────────────────────────────────────────────────────

// OpenAI content blocks accepted by the Chat Completions API when passing
// a PDF inline:
//   { type: "file", file: { file_data: "data:application/pdf;base64,...", filename: "..." } }
// (requires gpt-4o / gpt-4o-mini or newer)
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

async function callOpenAI(body: any): Promise<Response> {
  if (!OPENAI_API_KEY) {
    console.error("[llm-proxy] OPENAI_API_KEY missing");
    return json(
      {
        error: "OPENAI_API_KEY not configured. Add it in Supabase → Project Settings → Edge Functions → Secrets.",
        protocol_version: PROTOCOL_VERSION,
      },
      500,
    );
  }

  const {
    system,
    messages,
    maxTokens = 1000,
    model = DEFAULT_OPENAI_MODEL,
    temperature,
    tools,
    tool_choice,
    prompt,
  } = body ?? {};

  const inputMessages =
    Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: "user", content: String(prompt ?? "") }];

  const openaiMessages = anthropicMessagesToOpenAI(inputMessages, system);
  const openaiTools = Array.isArray(tools) && tools.length > 0
    ? anthropicToolsToOpenAI(tools)
    : undefined;
  const openaiToolChoice = openaiTools
    ? anthropicToolChoiceToOpenAI(tool_choice, tools?.[0]?.name)
    : undefined;

  const payload: Record<string, unknown> = {
    model,
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
    return json(
      { error: `OpenAI fetch failed: ${err instanceof Error ? err.message : String(err)}`, protocol_version: PROTOCOL_VERSION },
      502,
    );
  }

  const rawText = await resp.text();
  if (!resp.ok) {
    return json(
      { error: `OpenAI API ${resp.status}: ${rawText}`, protocol_version: PROTOCOL_VERSION },
      resp.status,
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    return json(
      {
        error: `OpenAI returned non-JSON: ${err instanceof Error ? err.message : String(err)}. Body head: ${rawText.slice(0, 200)}`,
        protocol_version: PROTOCOL_VERSION,
      },
      502,
    );
  }

  // Transform the first choice back into the Anthropic-compatible envelope.
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

  return json({
    text:     textOut,
    content:  textOut,
    tool_use: firstToolUse,
    raw:      data,
    protocol_version: PROTOCOL_VERSION,
  });
}

// ─── Anthropic path (unchanged from v5/v6 deploy) ───────────────────────────

async function callAnthropic(body: any): Promise<Response> {
  if (!ANTHROPIC_API_KEY) {
    return json(
      {
        error: "ANTHROPIC_API_KEY not configured. Add it in Supabase → Project Settings → Edge Functions → Secrets.",
        protocol_version: PROTOCOL_VERSION,
      },
      500,
    );
  }

  const {
    prompt,
    system,
    messages,
    maxTokens = 1000,
    model = DEFAULT_ANTHROPIC_MODEL,
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
    if (tool_choice) payload.tool_choice = tool_choice;
    else if (tools[0]?.name) payload.tool_choice = { type: "tool", name: tools[0].name };
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
    return json(
      { error: `Anthropic fetch failed: ${err instanceof Error ? err.message : String(err)}`, protocol_version: PROTOCOL_VERSION },
      502,
    );
  }

  const rawText = await resp.text();
  if (!resp.ok) {
    return json(
      { error: `Anthropic API ${resp.status}: ${rawText}`, protocol_version: PROTOCOL_VERSION },
      resp.status,
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    return json(
      {
        error: `Anthropic returned non-JSON: ${err instanceof Error ? err.message : String(err)}. Body head: ${rawText.slice(0, 200)}`,
        protocol_version: PROTOCOL_VERSION,
      },
      502,
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

  return json({
    text:     textOut,
    content:  textOut,
    tool_use: firstToolUse,
    raw:      data,
    protocol_version: PROTOCOL_VERSION,
  });
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")    return json({ error: "Method not allowed", protocol_version: PROTOCOL_VERSION }, 405, req);

  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return json(
      { error: `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`, protocol_version: PROTOCOL_VERSION },
      400,
    );
  }

  const provider = String(body?.provider || "anthropic").toLowerCase();

  // Log enough about the incoming body to diagnose shape issues without
  // dumping huge base64 payloads into the logs.
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
    console.log(`[llm-proxy] provider=${provider} model=${body?.model || "default"} maxTokens=${body?.maxTokens || "default"} msgs=${msgCount} blocks=${contentBlocks} tools=${toolCount} docB64Bytes=${docBytes}`);
  } catch (e) {
    console.log("[llm-proxy] pre-dispatch log failed:", (e as Error)?.message);
  }

  try {
    if (provider === "openai")    return await callOpenAI(body);
    if (provider === "anthropic") return await callAnthropic(body);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 5).join(" | ") : null;
    console.error(`[llm-proxy] ${provider} handler threw: ${name}: ${message}${stack ? " stack: " + stack : ""}`);
    return json(
      { error: `${provider} handler: ${name}: ${message}`, protocol_version: PROTOCOL_VERSION },
      500,
    );
  }
  return json(
    { error: `Unknown provider: "${provider}". Use "anthropic" or "openai".`, protocol_version: PROTOCOL_VERSION },
    400,
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : null;
    return json(
      {
        error: `Unhandled ${name}: ${message}`,
        stack: stack ? stack.split("\n").slice(0, 10).join("\n") : null,
        protocol_version: PROTOCOL_VERSION,
      },
      500,
    );
  }
});
