/** Pure helpers for PortfolioHub tab resolution. */

export const PORTFOLIO_TABS = [
  { key: "overview", label: "Portfolio Overview" },
  { key: "executive", label: "Executive View" },
] as const;

export type PortfolioTabKey = (typeof PORTFOLIO_TABS)[number]["key"];

export function resolvePortfolioTabKey(
  param: string | null | undefined,
): PortfolioTabKey {
  return PORTFOLIO_TABS.some((t) => t.key === param)
    ? (param as PortfolioTabKey)
    : "overview";
}
