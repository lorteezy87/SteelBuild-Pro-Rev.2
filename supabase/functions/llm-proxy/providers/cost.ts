// providers/cost.ts
//
// LLM rate card. Prices are per 1M input/output tokens, USD.
//
// Source: vendor public pricing pages, verified 2026-10-08. To refresh:
//   - Anthropic: https://www.anthropic.com/pricing#anthropic-api
//   - OpenAI:    https://openai.com/api/pricing
// When you bump a rate, also bump the comment date so future readers
// know how stale the table is.
//
// Unknown (provider, model) tuples return null — callers must treat
// null as "cost unknown" and persist NULL into llm_telemetry.cost_usd
// rather than crashing or guessing zero.

interface ModelRate {
  /** USD per 1,000,000 input tokens */
  inputPerM: number;
  contextTokens: number;
  maxOutputTokens: number;
  /** USD per 1,000,000 output tokens */
  outputPerM: number;
}

// Rates/context: developers.openai.com/api/docs/models/{model};
// platform.claude.com/docs/en/models/{model}/overview and /en/about-claude/pricing.
// Opus 4 context: anthropic.com/claude/opus (200K). No beta/extended context headers.
const RATE_CARD: Record<string, Record<string, ModelRate>> = {
  anthropic: {
    "claude-sonnet-4-5": { inputPerM: 3.00,  outputPerM: 15.00, contextTokens: 200_000, maxOutputTokens: 64_000 },
    "claude-opus-4":     { inputPerM: 15.00, outputPerM: 75.00, contextTokens: 200_000, maxOutputTokens: 32_000 },
    "claude-haiku-4-5":  { inputPerM: 1.00,  outputPerM: 5.00, contextTokens: 200_000, maxOutputTokens: 64_000 },
  },
  openai: {
    "gpt-4o-mini":       { inputPerM: 0.15,  outputPerM: 0.60, contextTokens: 128_000, maxOutputTokens: 16_384 },
    "gpt-4o":            { inputPerM: 2.50,  outputPerM: 10.00, contextTokens: 128_000, maxOutputTokens: 16_384 },
    "gpt-4-turbo":       { inputPerM: 10.00, outputPerM: 30.00, contextTokens: 128_000, maxOutputTokens: 4_096 },
  },
};

/**
 * Compute cost in USD for a single LLM call.
 *
 * Returns null if either the provider or the model is not in the rate
 * card. The dispatcher writes NULL into `cost_usd` when this returns
 * null so we don't silently zero-out spend on a model we forgot to
 * price.
 */
export function computeCostUsd(
  provider: string,
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  const providerRates = Object.hasOwn(RATE_CARD, provider) ? RATE_CARD[provider] : undefined;
  if (!providerRates) return null;
  const rate = Object.hasOwn(providerRates, model) ? providerRates[model] : undefined;
  if (!rate) return null;

  if (!Number.isSafeInteger(inputTokens) || inputTokens == null || inputTokens < 0
    || !Number.isSafeInteger(outputTokens) || outputTokens == null || outputTokens < 0) return null;
  const inTok = inputTokens;
  const outTok = outputTokens;
  const cost = (inTok * rate.inputPerM + outTok * rate.outputPerM) / 1_000_000;
  // Round to 6 decimal places — matches numeric(12,6) on the column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Whether (provider, model) is a model the gateway will serve — defined as
 * "priced in the rate card above". Tying allowed ≡ priced means an allowed call
 * always records a real cost_usd (an unpriced model would log NULL, silently
 * escaping spend tracking) and a caller can't request an arbitrary/expensive
 * model via an explicit provider/model override. To allow a model, price it here.
 */
export function isModelPriced(provider: string, model: string): boolean {
  return Object.hasOwn(RATE_CARD, provider) && Object.hasOwn(RATE_CARD[provider], model);
}

/** Exported for tests + admin tooling. */
export function getRateCard(): typeof RATE_CARD {
  return RATE_CARD;
}

/** Conservative reservation covers the entire model context, including image/PDF tokens.
 * No byte-to-token heuristic can safely predict multimodal billing. */
export function modelCostReservation(provider: string, model: string, maxTokens: number): { cost: number; maxTokens: number } {
  if (!isModelPriced(provider, model)) throw new Error('Unpriced model');
  const rate = RATE_CARD[provider][model];
  const output = Math.min(maxTokens, rate.maxOutputTokens);
  const cost = (rate.contextTokens * rate.inputPerM + output * rate.outputPerM) / 1_000_000;
  return { cost: Math.ceil(cost * 1_000_000) / 1_000_000, maxTokens: output };
}
