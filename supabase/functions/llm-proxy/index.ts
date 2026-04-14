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
//     file_urls?:    string[]              // ACCEPTED but IGNORED — callers should
//                                           // inline PDF text into the prompt
//   }
//
// Response body (success):
//   { text: string, content: string, raw: object }
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

  const text =
    (Array.isArray(data?.content) && data.content[0]?.text) ||
    data?.content ||
    "";

  return json({ text, content: text, raw: data });
});
