/** Pure helpers for CalculatorsHub tab resolution. */

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
  return (CALCULATOR_TAB_KEYS as readonly string[]).includes(param || "")
    ? (param as CalculatorTabKey)
    : "calculator";
}
