// providers/cost.ts
//
// LLM rate card. Prices are per 1M input/output tokens, USD.
//
// Source: vendor public pricing pages, captured May 2026. To refresh:
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
  /** USD per 1,000,000 output tokens */
  outputPerM: number;
}

// Rates as of May 2026.
const RATE_CARD: Record<string, Record<string, ModelRate>> = {
  anthropic: {
    "claude-sonnet-4-5": { inputPerM: 3.00,  outputPerM: 15.00 },
    "claude-opus-4":     { inputPerM: 15.00, outputPerM: 75.00 },
    "claude-haiku-4":    { inputPerM: 0.25,  outputPerM: 1.25 },
  },
  openai: {
    "gpt-4o-mini":       { inputPerM: 0.15,  outputPerM: 0.60 },
    "gpt-4o":            { inputPerM: 2.50,  outputPerM: 10.00 },
    "gpt-4-turbo":       { inputPerM: 10.00, outputPerM: 30.00 },
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
  const providerRates = RATE_CARD[provider];
  if (!providerRates) return null;
  const rate = providerRates[model];
  if (!rate) return null;

  const inTok = Number(inputTokens) || 0;
  const outTok = Number(outputTokens) || 0;
  const cost = (inTok * rate.inputPerM + outTok * rate.outputPerM) / 1_000_000;
  // Round to 6 decimal places — matches numeric(12,6) on the column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Exported for tests + admin tooling. */
export function getRateCard(): typeof RATE_CARD {
  return RATE_CARD;
}
