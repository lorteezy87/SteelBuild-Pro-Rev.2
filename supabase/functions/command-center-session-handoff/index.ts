import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildRedeemResponse,
  createHandoff,
  deriveCodeChallenge,
  hashOpaqueValue,
  validateBase64Url,
} from "./handoff.ts";

const MAX_REQUEST_BYTES = 32_768;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return jsonResponse({ error: "POST required" }, 405, request);

  try {
    const body = await readJsonObject(request);
    if (body.action === "create") return handleCreate(request, body);
    if (body.action === "redeem") return handleRedeem(request, body);
    return jsonResponse({ error: "Unsupported handoff action" }, 400, request);
  } catch (error) {
    const message = error instanceof RequestError ? error.message : "Invalid handoff request";
    const status = error instanceof RequestError ? error.status : 400;
    return jsonResponse({ error: message }, status, request);
  }
});

async function handleCreate(request: Request, body: Record<string, unknown>): Promise<Response> {
  requireExactKeys(body, ["action", "state", "codeChallenge", "encryptedSession"]);
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new RequestError(401, "Authenticated SteelBuild session required");
  }

  const { url, anonKey, serviceKey } = requireEnvironment();
  const token = authHeader.slice("Bearer ".length).trim();
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) {
    throw new RequestError(401, "Authenticated SteelBuild session required");
  }

  const created = await createHandoff({
    userId: userData.user.id,
    state: requireString(body.state, "state"),
    codeChallenge: requireString(body.codeChallenge, "codeChallenge"),
    encryptedSession: body.encryptedSession,
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("create_desktop_session_handoff", {
    p_code_hash: created.record.codeHash,
    p_user_id: created.record.userId,
    p_state: created.record.state,
    p_code_challenge: created.record.codeChallenge,
    p_encrypted_session: created.record.encryptedSession,
    p_created_at: created.record.createdAt,
    p_expires_at: created.record.expiresAt,
  });
  if (error || typeof data !== "string") {
    throw new RequestError(503, "Unable to create desktop handoff");
  }

  return jsonResponse({ code: created.code, expiresAt: data }, 200, request);
}

async function handleRedeem(request: Request, body: Record<string, unknown>): Promise<Response> {
  requireExactKeys(body, ["action", "code", "verifier"]);
  const code = validateBase64Url(body.code, "code", 43, 64);
  const verifier = validateBase64Url(body.verifier, "verifier", 43, 128);
  const [codeHash, codeChallenge] = await Promise.all([
    hashOpaqueValue(code),
    deriveCodeChallenge(verifier),
  ]);

  const { url, serviceKey } = requireEnvironment();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("consume_desktop_session_handoff", {
    p_code_hash: codeHash,
    p_code_challenge: codeChallenge,
  });
  const row = Array.isArray(data) ? data[0] : undefined;
  if (error || !row) {
    throw new RequestError(409, "Handoff is invalid, expired, or already consumed");
  }

  const response = buildRedeemResponse({
    state: row.state,
    encryptedSession: row.encrypted_session,
  });
  return jsonResponse(response, 200, request);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestError(413, "Handoff request is too large");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError(400, "Handoff request must be a JSON object");
  }
}

function requireEnvironment(): { url: string; anonKey: string; serviceKey: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new RequestError(503, "Handoff service is not configured");
  return { url, anonKey, serviceKey };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new RequestError(400, `${field} must be a string`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new RequestError(400, "Handoff request contains unsupported or missing fields");
  }
}

class RequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
