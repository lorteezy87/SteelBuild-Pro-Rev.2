/**
 * hubLinks — the Detailing Control Center's URL contract, in one place.
 */

export const HUB_PATH = "/DrawingSubmittalHub";

export const HUB_TAB_KEYS = [
  "overview",
  "process",
  "drawings",
  "submittals",
  "transmittals",
  "matrix",
  "revimpact",
  "holds",
  "validation",
  "model3d",
] as const;
export type HubTabKey = (typeof HUB_TAB_KEYS)[number];

export const DEFAULT_HUB_TAB: HubTabKey = "overview";

export interface HubTabAlias {
  tab: HubTabKey;
  view?: string;
}
export type HubTabAliases = Readonly<Record<string, HubTabAlias>>;

export const HUB_TAB_ALIASES: HubTabAliases = Object.freeze({
  doccontrol: Object.freeze({ tab: "drawings", view: "sheets" }),
});

export const HUB_VIEWS = {
  drawings: ["sheets", "sets", "reviews"],
  revimpact: ["computed", "log"],
} as const satisfies Partial<Record<HubTabKey, readonly string[]>>;
export type HubViewTab = keyof typeof HUB_VIEWS;
export type HubView<T extends HubViewTab> = (typeof HUB_VIEWS)[T][number];

function hasViews(tab: string): tab is HubViewTab {
  return Object.prototype.hasOwnProperty.call(HUB_VIEWS, tab);
}

export function defaultHubView(tab: HubTabKey): string | null {
  return hasViews(tab) ? HUB_VIEWS[tab][0] : null;
}

export function parseHubView<T extends HubViewTab>(
  tab: T,
  raw: string | null | undefined,
): HubView<T> {
  const views: readonly HubView<T>[] = HUB_VIEWS[tab];
  const match = views.find((view) => view === raw);
  return match ?? views[0];
}

export function hubViewSearch<T extends HubViewTab>(
  prev: URLSearchParams | string,
  tab: T,
  view: HubView<T>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (view === HUB_VIEWS[tab][0]) next.delete("hub_view");
  else next.set("hub_view", view);
  return next;
}

export const HUB_TAB_SCOPED_PARAMS = [
  "recordId",
  "targetSetId",
  "prefilledStatus",
  "prefilledBallInCourt",
  "transmittal",
  "hub_view",
  "matrix_filter",
] as const;

export const HUB_NAV_DROPPED_PARAMS = ["projectId", "project"] as const;

const NAV_DROPPED: ReadonlySet<string> = new Set(HUB_NAV_DROPPED_PARAMS);

export interface ParsedHubTab {
  tab: HubTabKey;
  known: boolean;
  aliasedFrom: string | null;
  view: string | null;
}

function isHubTabKey(value: string): value is HubTabKey {
  return (HUB_TAB_KEYS as readonly string[]).includes(value);
}

export function parseHubTab(
  raw: string | null | undefined,
  aliases: HubTabAliases = HUB_TAB_ALIASES,
): ParsedHubTab {
  if (!raw) return { tab: DEFAULT_HUB_TAB, known: true, aliasedFrom: null, view: null };
  if (Object.prototype.hasOwnProperty.call(aliases, raw)) {
    const alias = aliases[raw];
    return { tab: alias.tab, known: true, aliasedFrom: raw, view: alias.view ?? null };
  }
  if (isHubTabKey(raw)) return { tab: raw, known: true, aliasedFrom: null, view: null };
  return { tab: DEFAULT_HUB_TAB, known: false, aliasedFrom: null, view: null };
}

export type HubQuery = Readonly<Record<string, string | null | undefined>>;

export function hubHref(tab: HubTabKey, query: HubQuery = {}): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_HUB_TAB) params.set("hub_tab", tab);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "" || key === "hub_tab" || NAV_DROPPED.has(key)) continue;
    params.set(key, value);
  }
  const search = params.toString();
  return search ? `${HUB_PATH}?${search}` : HUB_PATH;
}

export function submittalRecordHref(submittalId: string): string {
  return hubHref("submittals", { recordId: submittalId });
}

export function createSubmittalHref(setId: string): string {
  return hubHref("submittals", { targetSetId: setId });
}

function recordHref(
  submittalId: string | null | undefined,
  drawingSetId: string | null | undefined,
  routeTab: string | null | undefined,
): string {
  if (submittalId) return submittalRecordHref(submittalId);
  if (drawingSetId) return hubHref("drawings", { hub_view: "sets" });
  return hubHref(parseHubTab(routeTab).tab);
}

export interface TriageLinkTarget {
  _submittalId?: string | null;
  _drawingSetId?: string | null;
  routeTab?: string | null;
}

export function hubHrefForTriageItem(item: TriageLinkTarget): string {
  return recordHref(item._submittalId, item._drawingSetId, item.routeTab);
}

export interface BoardLinkTarget {
  submittalId?: string | null;
  drawingSetId?: string | null;
  routeTab?: string | null;
}

export function hubHrefForBoardItem(item: BoardLinkTarget): string {
  return recordHref(item.submittalId, item.drawingSetId, item.routeTab);
}

export function nextTabSearch(
  prev: URLSearchParams | string,
  tab: HubTabKey,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const param of HUB_TAB_SCOPED_PARAMS) next.delete(param);
  for (const param of HUB_NAV_DROPPED_PARAMS) next.delete(param);
  next.set("hub_tab", tab);
  return next;
}

export function canonicalHubSearch(
  search: URLSearchParams | string,
  aliases: HubTabAliases = HUB_TAB_ALIASES,
): string | null {
  const params = new URLSearchParams(search);
  const parsed = parseHubTab(params.get("hub_tab"), aliases);
  if (parsed.known && !parsed.aliasedFrom) return null;
  if (parsed.aliasedFrom) {
    params.set("hub_tab", parsed.tab);
    if (parsed.view) {
      if (parsed.view === defaultHubView(parsed.tab)) params.delete("hub_view");
      else params.set("hub_view", parsed.view);
    }
  } else {
    params.delete("hub_tab");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}
