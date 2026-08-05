/** Pure helpers for PortfolioHub tab resolution. */

import { resolveHubTabKey } from "@/pages/hubs/hubTabHelpers";

export const PORTFOLIO_TABS = [
  { key: "overview", label: "Portfolio Overview" },
  { key: "executive", label: "Executive View" },
] as const;

export type PortfolioTabKey = (typeof PORTFOLIO_TABS)[number]["key"];


const PORTFOLIO_TAB_KEYS = PORTFOLIO_TABS.map((t) => t.key);

export function resolvePortfolioTabKey(
  param: string | null | undefined,
): PortfolioTabKey {
  return resolveHubTabKey(param, PORTFOLIO_TAB_KEYS, "overview") as PortfolioTabKey;
}
