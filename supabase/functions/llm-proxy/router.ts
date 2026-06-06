// router.ts
//
// Use-case → (provider, model) routing table for the LLM gateway.
//
// Phase 1 INTENT: mirror current production behavior. The vast majority
// of callers default to OpenAI/gpt-4o-mini today; switching them
// silently to Anthropic during the gateway rollout would be a behavior
// change disguised as a refactor. Phase 2 will use llm_telemetry data
// to make informed per-use-case provider switches.
//
// To add a new use case:
//   1. Add a row to ROUTING_TABLE.
//   2. Add the corresponding `useCase` value at the call site.
//   3. (Optional) Update ARCHITECTURE.md → "LLM gateway" with the
//      reason this caller wants its own routing key.
//
// To switch a use case to a new provider in Phase 2:
//   1. Verify the new (provider, model) pair is in providers/cost.ts.
//   2. Change the row here.
//   3. Roll the edge function deploy. Wire format is unchanged.

export interface RoutingTarget {
  provider: string;
  model: string;
}

export const ROUTING_TABLE: Record<string, RoutingTarget> = {
  // Default catch-all. New code that hasn't picked a useCase yet ends
  // up here. Switched from Anthropic Sonnet 4.5 → OpenAI gpt-4o
  // (May 2026) after Anthropic credit balance was exhausted.
  "general":               { provider: "openai",    model: "gpt-4o" },

  // Mirror current production routing for the existing AI features.
  // Each of these defaults to OpenAI gpt-4o-mini today inside the
  // caller — the router preserves that.
  "drawing-analysis":      { provider: "openai",    model: "gpt-4o-mini" },
  "revision-compare":      { provider: "openai",    model: "gpt-4o-mini" },
  "sheet-extraction":      { provider: "openai",    model: "gpt-4o-mini" },

  // Schedule-assistant routes each model turn through llm-proxy while
  // keeping schedule tool execution inside its own JWT-scoped function.
  // Switched from Anthropic → OpenAI (May 2026) — credit balance exhausted.
  "schedule-assist":       { provider: "openai",    model: "gpt-4o" },

  // Bonus callers that the audit found. All currently default to
  // OpenAI in their respective modules.
  "drawing-link-suggest":  { provider: "openai",    model: "gpt-4o-mini" },
  "shipping-ticket-import":{ provider: "openai",    model: "gpt-4o-mini" },
  "rfi-log-import":        { provider: "openai",    model: "gpt-4o-mini" },
  "photo-ocr":             { provider: "openai",    model: "gpt-4o-mini" },
  "email-classify":        { provider: "openai",    model: "gpt-4o-mini" },

  // RFI Copilot — drafts RFI responses / clarifies questions for the user to
  // review. Uses the full gpt-4o (not mini) for response quality. Until the
  // next llm-proxy deploy this key falls back to "general" (also gpt-4o), so
  // the live copilot already works against the deployed gateway.
  "rfi-copilot":           { provider: "openai",    model: "gpt-4o" },
};

/**
 * Resolve a use case to a routing target. Unknown use cases (typos,
 * future-callers-from-the-past) fall back to "general" rather than
 * erroring out — telemetry will surface the unknown key so we can
 * decide whether to add it.
 */
export function getProviderForUseCase(useCase: string | undefined | null): RoutingTarget {
  const key = (useCase && typeof useCase === "string") ? useCase : "general";
  return ROUTING_TABLE[key] || ROUTING_TABLE["general"];
}
