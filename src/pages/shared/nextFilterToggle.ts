/**
 * KPI / chip toggle for single-dimension string filters.
 * Clicking the active value returns `"all"`; otherwise selects the value.
 * Passing `"all"` always clears to `"all"`.
 */
export function nextFilterToggle(current: string, clicked: string): string {
  if (clicked === "all") return "all";
  return current === clicked ? "all" : clicked;
}
