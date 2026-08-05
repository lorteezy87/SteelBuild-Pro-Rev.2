/** Pure helpers for CalculatorsHub tab resolution. */

import { resolveHubTabKey } from "@/pages/hubs/hubTabHelpers";

export const CALCULATOR_TAB_KEYS = [
  "calculator",
  "feetinches",
  "steelweight",
  "cranepick",
  "decimalfraction",
] as const;

export type CalculatorTabKey = (typeof CALCULATOR_TAB_KEYS)[number];


export function resolveCalculatorTabKey(
  param: string | null | undefined,
): CalculatorTabKey {
  return resolveHubTabKey(param, CALCULATOR_TAB_KEYS, "calculator") as CalculatorTabKey;
}

export const CALCULATOR_HUB_TAB_DEFS = [
  { key: "calculator", label: "Calculator" },
  { key: "feetinches", label: "Ft / In" },
  { key: "steelweight", label: "Steel Weight" },
  { key: "cranepick", label: "Crane Pick" },
  { key: "decimalfraction", label: "Decimal / Fraction" },
] as const;
