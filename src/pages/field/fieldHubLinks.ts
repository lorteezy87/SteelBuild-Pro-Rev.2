/**
 * Field pages live as tabs inside Field Hub. A link from the Field overview to
 * a standalone route (/Punchlist, /Safety…) left the hub, and for gated pages
 * landed on "module disabled" while the same register was one tab away. These
 * helpers keep every field link inside the hub and let callers ask whether the
 * destination's module is on.
 */
export const FIELD_PAGE_TAB: Readonly<Record<string, string>> = Object.freeze({
  FieldToday: "today",
  Field: "overview",
  DailyLogs: "dailylogs",
  Photos: "photos",
  LEMs: "lems",
  Inspections: "inspections",
  Punchlist: "punchlist",
  QualityControl: "quality",
  Safety: "safety",
});

/** "/Punchlist?id=1" → "Punchlist". */
export function pageOfHref(href: string): string {
  return href.replace(/^\//, "").split(/[?#]/)[0];
}

/**
 * "/Punchlist?id=1" → "/FieldHub?field_tab=punchlist&id=1". Pages that are not
 * Field Hub tabs (Deliveries, …) are returned unchanged.
 */
export function fieldHubHref(href: string): string {
  const page = pageOfHref(href);
  const tab = FIELD_PAGE_TAB[page];
  if (!tab) return href;
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const qs = new URLSearchParams(query);
  const out = new URLSearchParams({ field_tab: tab });
  qs.forEach((v, k) => { if (k !== "field_tab") out.set(k, v); });
  return `/FieldHub?${out.toString()}`;
}
