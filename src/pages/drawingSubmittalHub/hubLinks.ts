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
 * Every ?hub_tab= key the hub has shipped. Bookmarks and inbound links use all
 * of them, so each must keep resolving. model3d is always a member: the
 * viewer_3d flag reads false until the flags query lands, so gating the key on
 * it would rewrite live 3D links while flags load. The flag gates the body only.
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
  "doccontrol",
  "model3d",
] as const;
export type HubTabKey = (typeof HUB_TAB_KEYS)[number];

/** The Control Board: the bare path, and where anything unrecognised lands. */
export const DEFAULT_HUB_TAB: HubTabKey = "overview";

/**
 * A retired key and where it lives now. `view` is the target tab's sub-view
 * (hub_view) the old key used to show, when that isn't the tab's default.
 */
export interface HubTabAlias {
  tab: HubTabKey;
  view?: string;
}
export type HubTabAliases = Readonly<Record<string, HubTabAlias>>;

/** Retired keys → their new home. None yet; nothing emits 2026's spellings. */
export const HUB_TAB_ALIASES: HubTabAliases = Object.freeze({});

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
 * target, plus the alias's view). null when the URL is already canonical,
 * which includes every HUB_TAB_KEYS member, model3d too, so the redirect can't
 * loop. Only hub_tab (and hub_view, for a view alias) changes.
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
    if (parsed.view) params.set("hub_view", parsed.view);
  } else {
    params.delete("hub_tab");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}
