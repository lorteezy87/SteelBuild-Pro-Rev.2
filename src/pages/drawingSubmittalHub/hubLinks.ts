/**
 * hubLinks — the Detailing Control Center's URL contract, in one place.
 *
 * The canonical URL is /DrawingSubmittalHub?hub_tab=<key>. Every in-hub link,
 * tab switch and URL correction is built here so they can't drift apart:
 *   - hubHref: an absolute in-hub link (hub_tab omitted for the Control Board,
 *     empty values dropped).
 *   - nextTabSearch: what a tab switch writes.
 *   - canonicalHubSearch: the correction the route wrapper applies, before
 *     anything mounts, to an unknown (or aliased) hub_tab.
 *
 * In-hub navigation never carries ?projectId= / ?project=. The hub reads its
 * project from ProjectContext, and ProjectScopedRoute has already synced any
 * URL project before the hub mounts. A pushed entry that re-pinned it would
 * make Back, after a project switch, quietly re-select the old project.
 *
 * Pure: no React, no router.
 */

/** The hub's route (config/routes.js registers the page as "DrawingSubmittalHub"). */
export const HUB_PATH = "/DrawingSubmittalHub";

/**
 * The live ?hub_tab= keys. Every key the hub has ever shipped must keep
 * resolving (bookmarks and inbound links use them all), so a retired key moves
 * from here to HUB_TAB_ALIASES rather than disappearing. model3d is always a
 * member: the viewer_3d flag reads false until the flags query lands, so gating
 * the key on it would rewrite live 3D links while flags load. The flag gates
 * the body only.
 */
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

/** The Control Board: the bare path, and where anything unrecognised lands. */
export const DEFAULT_HUB_TAB: HubTabKey = "overview";

/**
 * A retired key and where it lives now. `view` is the target tab's sub-view
 * (hub_view) the old key showed. The tab's default view is written as no
 * hub_view at all, and it overrides any hub_view the old URL carried.
 */
export interface HubTabAlias {
  tab: HubTabKey;
  view?: string;
}
export type HubTabAliases = Readonly<Record<string, HubTabAlias>>;

/**
 * Retired keys → their new home. The route wrapper redirects them (replace)
 * and passes state.hubAliasedFrom, so the new home can say what moved.
 *   doccontrol: its default Register view was the same sheet grid Drawing
 *   Register opens on. Its Reviews view is Drawing Register › Reviews, its
 *   Impacts view Revision Impact › Impact log; Transmittals and Holds were
 *   already tabs of their own.
 */
export const HUB_TAB_ALIASES: HubTabAliases = Object.freeze({
  doccontrol: Object.freeze({ tab: "drawings", view: "sheets" }),
});

/**
 * Tab sub-views, carried in ?hub_view=. The first is the default and is
 * written as no param. A view is tab-scoped: tab switches clear it, and a
 * view toggle rewrites the current entry (replace), never adding history.
 */
export const HUB_VIEWS = {
  drawings: ["sheets", "sets", "reviews"],
  revimpact: ["computed", "log"],
} as const satisfies Partial<Record<HubTabKey, readonly string[]>>;
export type HubViewTab = keyof typeof HUB_VIEWS;
export type HubView<T extends HubViewTab> = (typeof HUB_VIEWS)[T][number];

function hasViews(tab: string): tab is HubViewTab {
  return Object.prototype.hasOwnProperty.call(HUB_VIEWS, tab);
}

/** The tab's default sub-view, or null for a tab without sub-views. */
export function defaultHubView(tab: HubTabKey): string | null {
  return hasViews(tab) ? HUB_VIEWS[tab][0] : null;
}

/** ?hub_view= value → one of the tab's views; anything else is its default. */
export function parseHubView<T extends HubViewTab>(tab: T, raw: string | null | undefined): HubView<T> {
  const views: readonly HubView<T>[] = HUB_VIEWS[tab];
  const match = views.find((view) => view === raw);
  return match ?? views[0];
}

/**
 * The search a view toggle writes: `prev` with hub_view set, or removed for
 * the tab's default view. Nothing else changes.
 */
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

/**
 * Params aimed at one tab: record/create deep links (Submittals reads
 * recordId, targetSetId and prefilled*; Transmittals reads transmittal), the
 * tab's sub-view (hub_view) and the matrix quick filter. A tab switch clears
 * them all, so an unconsumed one can't fire later, on some other visit.
 */
export const HUB_TAB_SCOPED_PARAMS = [
  "recordId",
  "targetSetId",
  "prefilledStatus",
  "prefilledBallInCourt",
  "transmittal",
  "hub_view",
  "matrix_filter",
] as const;

/**
 * Project deep-link params. ProjectScopedRoute consumes them before the hub
 * mounts; in-hub navigation drops them (see the header).
 */
export const HUB_NAV_DROPPED_PARAMS = ["projectId", "project"] as const;

const NAV_DROPPED: ReadonlySet<string> = new Set(HUB_NAV_DROPPED_PARAMS);

export interface ParsedHubTab {
  tab: HubTabKey;
  /** False only for a value that is neither a key nor an alias. */
  known: boolean;
  /** The retired key the URL used, when it was an alias. */
  aliasedFrom: string | null;
  /** The sub-view an alias implies, if any. */
  view: string | null;
}

function isHubTabKey(value: string): value is HubTabKey {
  return (HUB_TAB_KEYS as readonly string[]).includes(value);
}

/**
 * ?hub_tab= value → tab. Missing or empty is the Control Board (known). An
 * alias resolves to its target, and is checked first so a key can be retired
 * by aliasing it. Anything else is the Control Board, marked unknown.
 * Own-property lookups only: "constructor" is not an alias.
 */
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

/**
 * Absolute in-hub link: HUB_PATH, then hub_tab (omitted for the Control
 * Board), then `query` minus null, undefined and "" values. hub_tab and the
 * project params are never taken from `query`.
 */
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

// ── Record and create links (owner decision 3, 2026-09-11) ──────────────────
// A board click opens the record behind the item inside the hub, instead of
// just switching tabs. All are absolute hrefs for a push, so Back returns to
// the board. The receiving tab consumes and strips its own param: the
// embedded Submittal Register reads recordId (opens the record) and
// targetSetId (opens create with the set pre-linked). There is no new=1: REV2
// opens create from targetSetId alone.

/** Opens one submittal's record in the hub's Submittal Register. */
export function submittalRecordHref(submittalId: string): string {
  return hubHref("submittals", { recordId: submittalId });
}

/** Opens create on the hub's Submittal Register, pre-linked to a drawing set. */
export function createSubmittalHref(setId: string): string {
  return hubHref("submittals", { targetSetId: setId });
}

/**
 * The shared rule behind both board link builders:
 *   1. a submittal governs the item: open that submittal's record;
 *   2. else a drawing set backs it: Drawing Register › Sets & revisions;
 *   3. else the item's own tab (unknown or missing: the Control Board).
 */
function recordHref(
  submittalId: string | null | undefined,
  drawingSetId: string | null | undefined,
  routeTab: string | null | undefined,
): string {
  if (submittalId) return submittalRecordHref(submittalId);
  if (drawingSetId) return hubHref("drawings", { hub_view: "sets" });
  return hubHref(parseHubTab(routeTab).tab);
}

/** The fields a Control Board triage item (format.ts buildTriage) links by. */
export interface TriageLinkTarget {
  /** The governing submittal (set items) or the submittal itself (unlinked). */
  _submittalId?: string | null;
  _drawingSetId?: string | null;
  routeTab?: string | null;
}

/** Where a Control Board item opens: its governing submittal, its set, or its tab. */
export function hubHrefForTriageItem(item: TriageLinkTarget): string {
  return recordHref(item._submittalId, item._drawingSetId, item.routeTab);
}

/** The fields a Process Board card (processBoard.derive BoardItem) links by. */
export interface BoardLinkTarget {
  submittalId?: string | null;
  drawingSetId?: string | null;
  routeTab?: string | null;
}

/** Where a Process Board card opens, by the same rule as the Control Board. */
export function hubHrefForBoardItem(item: BoardLinkTarget): string {
  return recordHref(item.submittalId, item.drawingSetId, item.routeTab);
}

/**
 * The search a tab switch writes: `prev` minus every tab-scoped and project
 * param, with hub_tab set. Unrelated params survive. hub_tab is spelled out
 * even for the Control Board, as tab switches always have; the bare path and
 * ?hub_tab=overview both open it, and neither is ever rewritten.
 */
export function nextTabSearch(prev: URLSearchParams | string, tab: HubTabKey): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const param of HUB_TAB_SCOPED_PARAMS) next.delete(param);
  for (const param of HUB_NAV_DROPPED_PARAMS) next.delete(param);
  next.set("hub_tab", tab);
  return next;
}

/**
 * The corrected search ("" or "?…") for a URL whose hub_tab is unknown (the
 * param is dropped, so the Control Board opens) or an alias (rewritten to its
 * target, plus the alias's view: set, or removed when it's the target's
 * default). null when the URL is already canonical, which includes every
 * HUB_TAB_KEYS member, model3d too, so the redirect can't loop. Only hub_tab
 * (and hub_view, for a view alias) changes.
 */
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
