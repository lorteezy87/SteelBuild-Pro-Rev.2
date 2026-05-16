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
  // up here. Anthropic Sonnet 4.5 is the safest choice for ad-hoc
  // calls — strong reasoning, good cost-per-quality, and the existing
  // analyze-drawing path was already on it.
  "general":               { provider: "anthropic", model: "claude-sonnet-4-5" },

  // Mirror current production routing for the existing AI features.
  // Each of these defaults to OpenAI gpt-4o-mini today inside the
  // caller — the router preserves that.
  "drawing-analysis":      { provider: "openai",    model: "gpt-4o-mini" },
  "revision-compare":      { provider: "openai",    model: "gpt-4o-mini" },
  "sheet-extraction":      { provider: "openai",    model: "gpt-4o-mini" },

  // Schedule-assistant routes each model turn through llm-proxy while
  // keeping schedule tool execution inside its own JWT-scoped function.
  "schedule-assist":       { provider: "anthropic", model: "claude-sonnet-4-5" },

  // Bonus callers that the audit found. All currently default to
  // OpenAI in their respective modules.
  "drawing-link-suggest":  { provider: "openai",    model: "gpt-4o-mini" },
  "shipping-ticket-import":{ provider: "openai",    model: "gpt-4o-mini" },
  "rfi-log-import":        { provider: "openai",    model: "gpt-4o-mini" },
  "photo-ocr":             { provider: "openai",    model: "gpt-4o-mini" },
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
