/**
 * llmGateway.test.ts
 *
 * Unit tests for the LLM gateway router and cost helper.
 *
 * The actual TypeScript files live under
 * `supabase/functions/llm-proxy/{router,cost}.ts`. They have zero
 * Deno-specific imports, so Vitest can load them directly without a
 * separate Deno test runner. The provider client modules (anthropic.ts,
 * openai.ts) DO touch Deno.env so they are NOT covered here — they get
 * exercised through deployment smoke-tests.
 */

import { describe, it, expect } from "vitest";

import {
  ROUTING_TABLE,
  getProviderForUseCase,
  type RoutingTarget,
} from "../../supabase/functions/llm-proxy/router";
import {
  computeCostUsd,
  getRateCard,
} from "../../supabase/functions/llm-proxy/providers/cost";

describe("router.getProviderForUseCase", () => {
  it("routes drawing-analysis to OpenAI gpt-4o-mini", () => {
    const target: RoutingTarget = getProviderForUseCase("drawing-analysis");
    expect(target).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });

  it("routes revision-compare to OpenAI gpt-4o-mini (mirror current production)", () => {
    expect(getProviderForUseCase("revision-compare")).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });

  it("routes sheet-extraction to OpenAI gpt-4o-mini (mirror current production)", () => {
    expect(getProviderForUseCase("sheet-extraction")).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });

  it("routes the bonus callers (link-suggest, ticket, rfi-log, ocr) to OpenAI", () => {
    const bonus = [
      "drawing-link-suggest",
      "shipping-ticket-import",
      "rfi-log-import",
      "photo-ocr",
    ];
    for (const k of bonus) {
      expect(getProviderForUseCase(k)).toEqual({
        provider: "openai",
        model: "gpt-4o-mini",
      });
    }
  });

  it("routes schedule-assist to OpenAI gpt-4o", () => {
    // schedule-assistant keeps its local schedule tools, but its model
    // calls use this route so telemetry and provider switches stay
    // centralized in llm-proxy. Switched Anthropic → OpenAI (May 2026)
    // when the Anthropic credit balance was exhausted.
    expect(getProviderForUseCase("schedule-assist")).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  it("undefined → general fallback", () => {
    const target = getProviderForUseCase(undefined);
    expect(target).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("null → general fallback", () => {
    const target = getProviderForUseCase(null);
    expect(target).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("unknown useCase → general fallback (typos must NOT crash)", () => {
    const target = getProviderForUseCase("does-not-exist");
    expect(target).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("empty string → general fallback", () => {
    expect(getProviderForUseCase("")).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("ROUTING_TABLE has every key the existing callers need", () => {
    // Pin the contract: if anyone removes one of these keys, this test
    // will fail before the broken edge function ever ships.
    const required = [
      "general",
      "drawing-analysis",
      "revision-compare",
      "sheet-extraction",
      "schedule-assist",
      "drawing-link-suggest",
      "shipping-ticket-import",
      "rfi-log-import",
      "photo-ocr",
    ];
    for (const k of required) {
      expect(ROUTING_TABLE[k]).toBeDefined();
    }
  });
});

describe("cost.computeCostUsd", () => {
  it("Anthropic Sonnet 4.5 — 1M in + 1M out = $3 + $15 = $18.00", () => {
    const cost = computeCostUsd("anthropic", "claude-sonnet-4-5", 1_000_000, 1_000_000);
    expect(cost).toBe(18);
  });

  it("OpenAI gpt-4o-mini — 1M in + 1M out = $0.15 + $0.60 = $0.75", () => {
    const cost = computeCostUsd("openai", "gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBe(0.75);
  });

  it("OpenAI gpt-4o — 1M in + 1M out = $2.50 + $10.00 = $12.50", () => {
    expect(computeCostUsd("openai", "gpt-4o", 1_000_000, 1_000_000)).toBe(12.5);
  });

  it("Anthropic Opus 4 — 1M in + 1M out = $15 + $75 = $90.00", () => {
    expect(computeCostUsd("anthropic", "claude-opus-4", 1_000_000, 1_000_000)).toBe(90);
  });

  it("Anthropic Haiku 4 — 1M in + 1M out = $0.25 + $1.25 = $1.50", () => {
    expect(computeCostUsd("anthropic", "claude-haiku-4", 1_000_000, 1_000_000)).toBe(1.5);
  });

  it("Realistic small request — 1k input + 200 output on gpt-4o-mini ≈ $0.000270", () => {
    const cost = computeCostUsd("openai", "gpt-4o-mini", 1000, 200);
    // 0.15 * 1000 / 1e6 + 0.60 * 200 / 1e6 = 0.00015 + 0.00012 = 0.00027
    expect(cost).toBeCloseTo(0.00027, 6);
  });

  it("Unknown model returns null (don't crash, don't guess zero)", () => {
    expect(computeCostUsd("anthropic", "claude-99-fictional", 1000, 1000)).toBeNull();
    expect(computeCostUsd("openai", "gpt-99-also-fictional", 1000, 1000)).toBeNull();
  });

  it("Unknown provider returns null", () => {
    expect(computeCostUsd("xai", "grok-1", 1000, 1000)).toBeNull();
  });

  it("Null/undefined token counts treated as 0", () => {
    expect(computeCostUsd("openai", "gpt-4o-mini", null, null)).toBe(0);
    expect(computeCostUsd("openai", "gpt-4o-mini", undefined, undefined)).toBe(0);
  });

  it("Rate card exposes both providers", () => {
    const card = getRateCard();
    expect(card.anthropic).toBeDefined();
    expect(card.openai).toBeDefined();
    expect(card.anthropic["claude-sonnet-4-5"].inputPerM).toBe(3.0);
    expect(card.openai["gpt-4o-mini"].outputPerM).toBe(0.6);
  });
});
