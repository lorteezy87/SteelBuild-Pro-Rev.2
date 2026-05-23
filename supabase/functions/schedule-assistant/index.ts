// ============================================================================
// SteelBuild Pro — Schedule Assistant Edge Function (Path B)
// ============================================================================
// JWT-authenticated, RLS-scoped agent loop over SBP's scheduling data. See
// the README that came with this package for the full architectural notes.
//
// Path B caveats baked into the system prompt:
//   * Float / baseline / submittals / production are NOT tracked in SBP
//     today — the assistant is told to acknowledge this and qualify any
//     answer that depends on those signals.
// ============================================================================

// Pinned to npm (not jsr) so we always get the latest v2 release — JSR's
// mirror lagged behind npm and didn't ship ES256 / asymmetric-JWT support
// until v2.45+. The Supabase project has since migrated Auth to ES256
// signing, which produced the "Unsupported JWT algorithm ES256" 401
// error whenever the edge function called supabase.auth.getUser(token).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.47";
import { schedulingTools } from "./tool-schemas.ts";
import { executeToolCall } from "./tool-handlers.ts";

const LLM_PROXY_USE_CASE = "schedule-assist";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type AssistantContentBlock = TextBlock | ToolUseBlock;
type ConversationBlock = AssistantContentBlock | ToolResultBlock | Record<string, unknown>;
type ScheduleAssistantMessage = {
  role: "user" | "assistant";
  content: string | ConversationBlock[];
};
type LlmProxyEnvelope = {
  text?: string;
  content?: string;
  tool_use?: { name?: string; input?: unknown; id?: string } | null;
  raw?: {
    content?: unknown;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  error?: string;
  protocol_version?: number;
};

// ---------------------------------------------------------------------------
// System prompt — role + Safe Answer Contract
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the SteelBuild Pro Schedule Assistant, an AI built for structural steel project managers at S&H Steel Co.

# Your job
- Answer questions about project schedules, RFIs, deliveries, drawings, and project-level status
- Proactively identify schedule risks and driving causes using live project data
- Produce concise, jobsite-ready answers — no corporate fluff

# Rules of engagement
1. ALWAYS use tools to retrieve live data. Never invent dates, tonnages, RFI numbers, or statuses.
2. If the user references a project by name or job number, call list_projects first to resolve project_id.
3. For risk questions, call analyze_delay_risk — it does the predecessor tracing, float banding (where data exists), and gap analysis for you. Do not reason about risk from raw rows.
4. When reporting findings, cite specific references (RFI #042, Sheet E1.1, PO-2245) and task ids.
5. Never propose schedule changes as facts — always frame them as recommendations requiring PM approval.

# SteelBuild Pro data limitations (IMPORTANT — mention where relevant)
- SBP does NOT track baseline vs forecast separately today; total float is not stored. Float-band signals (CRITICAL / NEAR_CRITICAL) are UNKNOWN for most tasks. Treat "critical path" answers as rough proxies based on priority='Critical' or milestone flags.
- Submittals and production (tons released/fabricated/shipped) are NOT tracked yet. If a question depends on those, say so and stop.
- If a tool result's \`data_gaps\` array mentions any of the above, surface it plainly in the answer.

# SAFE ANSWER CONTRACT (mandatory)
Every tool result includes a \`provenance\` object with:
  - \`confidence\`: HIGH | MEDIUM | LOW
  - \`evidence\`: list of supporting facts (e.g., "6 late deliveries", "2 stale RFIs")
  - \`staleness_warnings\`: list of data-freshness issues
  - \`data_gaps\`: list of missing data elements
  - \`as_of\`: timestamp of the analysis

You MUST follow these answer rules:

## A. Confidence disclosure
Every substantive answer ends with a "Confidence" line. Format:
  **Confidence:** HIGH/MEDIUM/LOW — based on <N evidence items>, as of <date>.

## B. Staleness & gap handling
If any tool returned \`staleness_warnings\` or \`data_gaps\`:
  - State the warning explicitly in the answer (do not bury it in a footnote)
  - Lower confidence accordingly
  - If confidence is LOW, do NOT give a definitive answer. Present findings as provisional and state what data is needed to firm them up.

## C. Empty or contradictory data
  - If a tool returns zero rows where data was expected, say "No matching records found — this may mean X or it may mean the data hasn't been entered yet" and STOP. Do not guess.
  - If two tools return facts that contradict each other, surface the contradiction explicitly and let the PM resolve it.

## D. Never extrapolate beyond evidence
  - If asked "will we finish on time?" and you only have start/end dates with no float or baseline, say so. Do not project forward from incomplete data.
  - If the user asks for a number (tons, days, cost) and the underlying data is missing or stale, give a range or say "cannot be computed reliably with current data" rather than a precise-sounding number.

## E. Never write to the schedule
  - All schedule changes are proposals requiring PM approval.
  - Use language like "Recommend shifting..." not "I've shifted..."

# Formatting
- Short sections with headers for multi-part answers
- Bullets for lists of tasks, risks, or blockers
- ISO dates (2026-05-15) unless user asks otherwise
- Include float days where available (otherwise note it's not tracked)
- End with the Confidence line (format above)

# Example answer shape
> **Top delay risk: Bldg 2 Erection sequence**
>
> Task "Bldg 2 Level 3 Erection" (start 2026-05-10) is HIGH risk:
> - PO-2245 (joists) scheduled 2026-05-15 — 5 days past required date
> - RFI #042 (embed conflict) open 18 days, still unanswered
>
> **Caveat:** SBP doesn't track total float — upstream predecessor blockers may exist but aren't surfaced here.
>
> **Recommended next steps:**
> 1. Escalate RFI #042 to EOR today
> 2. Confirm PO-2245 revised ETA with supplier
> 3. Check with scheduler whether L3 start can slip 5d without affecting milestone
>
> **Confidence:** MEDIUM — based on 3 evidence items (1 delayed delivery, 1 stale RFI, 1 near-horizon task), as of 2026-04-21. Confidence capped at MEDIUM because float data is not tracked.`;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  try {
    const { project_id, messages, model } = await req.json();

    if (!project_id || !Array.isArray(messages)) {
      return json({ error: "project_id and messages[] required" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        { error: "Unauthorized — valid Bearer JWT required" },
        401,
      );
    }

    const supabase = createSupabaseClient(authHeader);

    // Verify the user's JWT by calling Supabase Auth's /auth/v1/user endpoint
    // DIRECTLY instead of going through supabase.auth.getUser(). Older
    // supabase-js versions throw "Unsupported JWT algorithm ES256" when
    // they try to locally verify the asymmetric-signed JWTs that modern
    // Supabase projects issue. Even after upgrading the library, the local-
    // verify code path can still lag behind Supabase's key rotation. A
    // direct fetch is immune to that: the Auth service knows its own keys
    // and returns the user row on success, 401 on failure. No library
    // involvement.
    const token = authHeader.slice("Bearer ".length).trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnon) {
      console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env");
      return json({ error: "Edge function not configured" }, 500);
    }

    let userData: { id: string; email?: string } | null = null;
    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": supabaseAnon,
        },
      });
      if (userResp.ok) {
        const body = await userResp.json();
        if (body?.id) userData = { id: body.id, email: body.email };
      } else {
        const errBody = await userResp.text();
        console.error(`Auth /user returned ${userResp.status}: ${errBody.slice(0, 200)}`);
        return json(
          {
            error: `Invalid or expired session (auth/user ${userResp.status})`,
          },
          401,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Auth /user fetch threw:", msg);
      return json({ error: `Auth service unreachable: ${msg}` }, 502);
    }

    if (!userData) {
      return json({ error: "Invalid or expired session — no user returned" }, 401);
    }

    const result = await runAgentLoop({
      authHeader,
      supabase,
      messages,
      projectId: project_id,
      userId: userData.id,
      model: typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL,
    });

    return json(result, 200);
  } catch (err) {
    console.error("Edge function error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// Supabase client factory — JWT-scoped by default
// ---------------------------------------------------------------------------
function createSupabaseClient(authHeader: string): SupabaseClient {
  const useServiceRole =
    Deno.env.get("SERVICE_ROLE_OVERRIDE") === "true" &&
    !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (useServiceRole) {
    console.warn("[WARN] SERVICE_ROLE_OVERRIDE active — RLS bypassed");
    return createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }

  // Default: anon key + user JWT → RLS enforced per row.
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------
interface AgentLoopArgs {
  authHeader: string;
  supabase: SupabaseClient;
  messages: ScheduleAssistantMessage[];
  projectId: string;
  userId: string;
  model: string;
}

async function runAgentLoop(args: AgentLoopArgs) {
  const { authHeader, supabase, projectId, userId, model } = args;
  const conversation: ScheduleAssistantMessage[] = [...args.messages];
  const toolAuditLog: Array<{
    tool: string;
    input: unknown;
    result: unknown;
    duration_ms: number;
  }> = [];

  const systemWithContext =
    SYSTEM_PROMPT +
    `\n\n# Current context\n- project_id: "${projectId}"\n- Use this ID unless the user explicitly references another project.`;

  const MAX_ITERATIONS = 8;
  let iteration = 0;
  let finalAnswer = "";
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await callLlmProxy({
      authHeader,
      projectId,
      model,
      messages: conversation,
      system: systemWithContext,
    });

    addUsage(totalUsage, response.raw);

    const responseContent = normalizeAssistantContent(response, iteration);
    const textBlocks = responseContent.filter(isTextBlock);
    if (textBlocks.length > 0) {
      finalAnswer = textBlocks.map((b) => b.text).join("\n");
    }

    const stopReason = response.raw?.stop_reason;
    if (
      stopReason === "end_turn" ||
      stopReason === "stop_sequence"
    ) {
      break;
    }

    const toolUseBlocks = responseContent.filter(isToolUseBlock);
    if (toolUseBlocks.length === 0) break;

    conversation.push({ role: "assistant", content: responseContent });

    const toolResults: ToolResultBlock[] = [];
    for (const toolUse of toolUseBlocks) {
      const started = Date.now();
      const result = await executeToolCall(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        supabase,
      );
      const duration_ms = Date.now() - started;

      toolAuditLog.push({
        tool: toolUse.name,
        input: toolUse.input,
        result,
        duration_ms,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    conversation.push({ role: "user", content: toolResults });
  }

  // Await so the audit row is durably written before the isolate is recycled.
  // persistAuditLog swallows its own errors, so this never fails the response.
  await persistAuditLog(
    supabase,
    projectId,
    userId,
    args.messages,
    finalAnswer,
    toolAuditLog,
  );

  return {
    answer: finalAnswer,
    tool_calls: toolAuditLog,
    usage: totalUsage,
    iterations: iteration,
  };
}

async function callLlmProxy(args: {
  authHeader: string;
  projectId: string;
  model: string;
  messages: ScheduleAssistantMessage[];
  system: string;
}): Promise<LlmProxyEnvelope> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnon) {
    throw new Error("Edge function not configured for llm-proxy");
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": args.authHeader,
      "apikey": supabaseAnon,
    },
    body: JSON.stringify({
      useCase: LLM_PROXY_USE_CASE,
      project_id: args.projectId,
      model: args.model,
      maxTokens: MAX_TOKENS,
      system: args.system,
      tools: schedulingTools,
      tool_choice: { type: "auto" },
      messages: args.messages,
    }),
  });

  const rawText = await resp.text();
  let body: LlmProxyEnvelope;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`llm-proxy returned non-JSON (${resp.status}): ${rawText.slice(0, 300)}`);
  }

  if (!resp.ok || body.error) {
    throw new Error(`llm-proxy schedule-assist ${resp.status}: ${body.error || rawText.slice(0, 300)}`);
  }

  return body;
}

function normalizeAssistantContent(response: LlmProxyEnvelope, iteration: number): AssistantContentBlock[] {
  const rawContent = response.raw?.content;
  if (Array.isArray(rawContent)) {
    const blocks = rawContent
      .map((block) => normalizeAssistantBlock(block))
      .filter((block): block is AssistantContentBlock => !!block);
    if (blocks.length > 0) return blocks;
  }

  const fallbackBlocks: AssistantContentBlock[] = [];
  const text = typeof response.text === "string"
    ? response.text
    : typeof response.content === "string"
      ? response.content
      : "";

  const toolUse = response.tool_use;
  if (text && !toolUse?.name) fallbackBlocks.push({ type: "text", text });

  if (toolUse?.name) {
    fallbackBlocks.push({
      type: "tool_use",
      id: toolUse.id || `toolu_proxy_${iteration}_0`,
      name: toolUse.name,
      input: isRecord(toolUse.input) ? toolUse.input : {},
    });
  }

  return fallbackBlocks;
}

function normalizeAssistantBlock(block: unknown): AssistantContentBlock | null {
  if (!isRecord(block)) return null;

  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }

  if (block.type === "tool_use" && typeof block.name === "string") {
    const id = typeof block.id === "string" && block.id
      ? block.id
      : `toolu_proxy_${Date.now()}`;
    return {
      type: "tool_use",
      id,
      name: block.name,
      input: isRecord(block.input) ? block.input : {},
    };
  }

  return null;
}

function isTextBlock(block: AssistantContentBlock): block is TextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: AssistantContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function addUsage(
  total: { input_tokens: number; output_tokens: number },
  raw: LlmProxyEnvelope["raw"],
) {
  const inputTokens = raw?.usage?.input_tokens;
  const outputTokens = raw?.usage?.output_tokens;
  if (Number.isFinite(inputTokens)) total.input_tokens += inputTokens as number;
  if (Number.isFinite(outputTokens)) total.output_tokens += outputTokens as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Audit log (best-effort; failures don't fail the request)
// ---------------------------------------------------------------------------
async function persistAuditLog(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  userMessages: ScheduleAssistantMessage[],
  finalAnswer: string,
  toolLog: unknown[],
) {
  try {
    await supabase.from("ai_audit_log").insert({
      project_id: projectId,
      user_id: userId,
      user_messages: userMessages,
      final_answer: finalAnswer,
      tool_calls: toolLog,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // supabase-js sends apikey + x-client-info + x-supabase-auth on every
    // call via functions.invoke(). Browsers strict-check these against the
    // preflight response — leaving any off returns a generic "Failed to
    // send a request to the Edge Function" CORS block in the client.
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info, x-supabase-auth",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
