// providers/types.ts
//
// Internal shapes for the multi-provider LLM gateway.
//
// IMPORTANT: these are *internal* to the edge function. The public wire
// envelope returned to callers is defined in index.ts and is unchanged
// from the v7 contract — `{ text, content, tool_use, raw, protocol_version }`.
// The router translates from `LLMResponse` (internal) → wire envelope
// (external) at the dispatcher boundary.

// deno-lint-ignore-file no-explicit-any

/**
 * Anthropic-style request (canonical form).
 *
 * Every provider client accepts this shape and is responsible for
 * adapting to/from its own API format. Keeping a single canonical form
 * means caller code (and the existing v7 wire format) does NOT need to
 * change when we add new providers in Phase 2.
 */
export interface LLMRequest {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: unknown }>;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  tools?: Array<{ name: string; [key: string]: unknown }>;
  tool_choice?: unknown;
  // Optional, for telemetry only:
  useCase?: string;
  projectId?: string | null;
}

/**
 * Internal canonical response. All provider clients must populate at
 * least { text, raw, model, inputTokens, outputTokens } on success.
 *
 * This is NOT the wire envelope — the dispatcher translates this into
 * the existing `{ text, content, tool_use, raw, protocol_version }`
 * shape that callers already consume.
 */
export interface LLMResponse {
  text: string;
  toolUse: { name: string; input: unknown } | null;
  raw: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Errors that escape provider clients are caught at the dispatcher and
 * mapped to the wire-format error envelope. Provider clients SHOULD
 * throw `LLMError` so we can preserve a stable HTTP status without
 * stringifying generic exceptions.
 */
export class LLMError extends Error {
  status: number;
  errorKind: string;
  constructor(message: string, status = 502, errorKind = "upstream_error") {
    super(message);
    this.name = "LLMError";
    this.status = status;
    this.errorKind = errorKind;
  }
}

/**
 * The provider client interface every concrete provider implements.
 *
 * `call()` MUST NOT throw on upstream 4xx/5xx — instead, throw
 * `LLMError` with the original status. That way the dispatcher can map
 * it to the wire error envelope cleanly without losing the status.
 */
export interface ProviderClient {
  readonly name: string;
  call(req: LLMRequest, opts: { model: string }): Promise<LLMResponse>;
}
