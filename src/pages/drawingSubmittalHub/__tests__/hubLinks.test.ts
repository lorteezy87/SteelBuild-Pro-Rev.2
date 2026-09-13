import { describe, expect, it } from "vitest";
import { createPageUrl } from "@/utils";
import { TABS } from "../format";
import {
  DEFAULT_HUB_TAB,
  HUB_NAV_DROPPED_PARAMS,
  HUB_PATH,
  HUB_TAB_ALIASES,
  HUB_TAB_KEYS,
  HUB_TAB_SCOPED_PARAMS,
  HUB_VIEWS,
  canonicalHubSearch,
  createSubmittalHref,
  defaultHubView,
  hubHref,
  hubHrefForBoardItem,
  hubHrefForTriageItem,
  hubViewSearch,
  nextTabSearch,
  parseHubTab,
  parseHubView,
  submittalRecordHref,
} from "../hubLinks";
import type { HubTabAliases } from "../hubLinks";

// Every ?hub_tab= key the hub has shipped. Pinned here rather than imported,
// so dropping one fails loudly: bookmarks and inbound links still use each.
const HISTORIC_KEYS = [
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
];
// Keys retired into an alias. Doc Control: owner decision, 2026-09-11.
const RETIRED_KEYS = ["doccontrol"];
const LIVE_KEYS = HISTORIC_KEYS.filter((key) => !RETIRED_KEYS.includes(key));

// A stand-in alias table, so the alias path is tested apart from the shipped
// one. `matrix` shadows a live key: an alias must win over a same-named key,
// which is how a key gets retired.
const ALIASES: HubTabAliases = {
  oldregister: { tab: "drawings", view: "sets" },
  oldsheets: { tab: "drawings", view: "sheets" },
  oldhub: { tab: "drawings" },
  matrix: { tab: "holds" },
};

describe("hub route and tab keys", () => {
  it("points at the registered hub page", () => {
    expect(HUB_PATH).toBe("/DrawingSubmittalHub");
    expect(HUB_PATH).toBe(createPageUrl("DrawingSubmittalHub"));
  });

  it("keeps all 11 historic keys resolving: live ones as tabs, retired ones as aliases", () => {
    expect([...HUB_TAB_KEYS]).toEqual(LIVE_KEYS);
    expect(Object.keys(HUB_TAB_ALIASES)).toEqual(RETIRED_KEYS);
    for (const key of HISTORIC_KEYS) {
      const parsed = parseHubTab(key);
      expect(parsed.known).toBe(true);
      expect(HUB_TAB_KEYS).toContain(parsed.tab);
    }
    expect(DEFAULT_HUB_TAB).toBe("overview");
  });

  it("retires Doc Control to the Drawing Register's sheet view", () => {
    expect(HUB_TAB_ALIASES.doccontrol).toEqual({ tab: "drawings", view: "sheets" });
  });

  it("knows every tab the hub renders, and renders no retired key", () => {
    for (const tab of TABS) {
      expect(HUB_TAB_KEYS).toContain(tab.key);
      expect(Object.prototype.hasOwnProperty.call(HUB_TAB_ALIASES, tab.key)).toBe(false);
    }
  });

  it("only aliases to real keys that aren't aliases themselves, and to real views, so a redirect can't chain or loop", () => {
    const views: Readonly<Record<string, readonly string[]>> = HUB_VIEWS;
    for (const alias of Object.values(HUB_TAB_ALIASES)) {
      expect(HUB_TAB_KEYS).toContain(alias.tab);
      expect(Object.prototype.hasOwnProperty.call(HUB_TAB_ALIASES, alias.tab)).toBe(false);
      if (alias.view) expect(views[alias.tab]).toContain(alias.view);
    }
  });

  it("scopes the record, create, sub-view and filter params to a tab, and drops the project params", () => {
    expect([...HUB_TAB_SCOPED_PARAMS]).toEqual([
      "recordId",
      "targetSetId",
      "prefilledStatus",
      "prefilledBallInCourt",
      "transmittal",
      "hub_view",
      "matrix_filter",
    ]);
    expect([...HUB_NAV_DROPPED_PARAMS]).toEqual(["projectId", "project"]);
  });
});

describe("parseHubTab", () => {
  it.each(LIVE_KEYS)("%s parses to itself", (key) => {
    expect(parseHubTab(key)).toEqual({ tab: key, known: true, aliasedFrom: null, view: null });
  });

  it("parses doccontrol to the Drawing Register's sheet view, marked as aliased", () => {
    expect(parseHubTab("doccontrol")).toEqual({ tab: "drawings", known: true, aliasedFrom: "doccontrol", view: "sheets" });
  });

  it.each(["bogus", "register", "board", "Matrix", " matrix", "constructor", "toString", "__proto__"])(
    "%j is unknown and opens the Control Board",
    (raw) => {
      expect(parseHubTab(raw)).toEqual({ tab: "overview", known: false, aliasedFrom: null, view: null });
    },
  );

  it.each([null, undefined, ""])("%j is the Control Board, and known", (raw) => {
    expect(parseHubTab(raw)).toEqual({ tab: "overview", known: true, aliasedFrom: null, view: null });
  });

  it("resolves an alias to its target and view, ahead of a same-named key", () => {
    expect(parseHubTab("oldregister", ALIASES)).toEqual({ tab: "drawings", known: true, aliasedFrom: "oldregister", view: "sets" });
    expect(parseHubTab("oldhub", ALIASES)).toEqual({ tab: "drawings", known: true, aliasedFrom: "oldhub", view: null });
    expect(parseHubTab("matrix", ALIASES)).toEqual({ tab: "holds", known: true, aliasedFrom: "matrix", view: null });
    expect(parseHubTab("constructor", ALIASES).known).toBe(false);
  });
});

describe("hubHref", () => {
  it("is the bare path for the Control Board", () => {
    expect(hubHref("overview")).toBe("/DrawingSubmittalHub");
    expect(hubHref("overview", { hub_view: "" })).toBe("/DrawingSubmittalHub");
  });

  it("puts hub_tab first and drops empty values", () => {
    expect(hubHref("holds")).toBe("/DrawingSubmittalHub?hub_tab=holds");
    expect(hubHref("submittals", { recordId: "s1", targetSetId: "" })).toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=s1");
    expect(hubHref("drawings", { hub_view: "sets", a: null, b: undefined })).toBe("/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets");
  });

  it("encodes values", () => {
    expect(hubHref("submittals", { targetSetId: "set 1&2" })).toBe("/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set+1%262");
  });

  it("never carries the project, or a second hub_tab", () => {
    expect(hubHref("holds", { project: "P", projectId: "P", hub_tab: "matrix" })).toBe("/DrawingSubmittalHub?hub_tab=holds");
    expect(hubHref("overview", { projectId: "P" })).toBe("/DrawingSubmittalHub");
  });
});

describe("nextTabSearch", () => {
  it("keeps unrelated params and drops record and project params", () => {
    expect(nextTabSearch("hub_tab=submittals&recordId=s1&foo=1&project=P", "matrix").toString()).toBe("hub_tab=matrix&foo=1");
  });

  it("clears every tab-scoped and project param, without touching its input", () => {
    const prev = new URLSearchParams({ hub_tab: "matrix" });
    for (const param of HUB_TAB_SCOPED_PARAMS) prev.set(param, "x");
    for (const param of HUB_NAV_DROPPED_PARAMS) prev.set(param, "P");
    expect(nextTabSearch(prev, "holds").toString()).toBe("hub_tab=holds");
    expect(prev.get("recordId")).toBe("x");
    expect(prev.get("hub_tab")).toBe("matrix");
  });

  it("clears the sub-view and the matrix filter even when switching into the matrix", () => {
    expect(nextTabSearch("?hub_tab=drawings&hub_view=sets&matrix_filter=hold", "matrix").toString()).toBe("hub_tab=matrix");
  });

  it("clears the sub-view when moving between two tabs that have them", () => {
    expect(nextTabSearch("?hub_tab=drawings&hub_view=reviews", "revimpact").toString()).toBe("hub_tab=revimpact");
  });

  it("spells out the Control Board, and adds hub_tab to a bare URL", () => {
    expect(nextTabSearch("hub_tab=matrix", "overview").toString()).toBe("hub_tab=overview");
    expect(nextTabSearch("", "holds").toString()).toBe("hub_tab=holds");
  });
});

describe("hub sub-views (hub_view)", () => {
  it("lists each tab's views, default first", () => {
    expect(HUB_VIEWS).toEqual({ drawings: ["sheets", "sets", "reviews"], revimpact: ["computed", "log"] });
    expect(defaultHubView("drawings")).toBe("sheets");
    expect(defaultHubView("revimpact")).toBe("computed");
    expect(defaultHubView("holds")).toBeNull();
  });

  it("parses a known view, and anything else as the tab's default", () => {
    expect(parseHubView("drawings", "sets")).toBe("sets");
    expect(parseHubView("drawings", "reviews")).toBe("reviews");
    expect(parseHubView("drawings", "x")).toBe("sheets");
    expect(parseHubView("drawings", null)).toBe("sheets");
    expect(parseHubView("drawings", "log")).toBe("sheets");
    expect(parseHubView("revimpact", "log")).toBe("log");
    expect(parseHubView("revimpact", "sets")).toBe("computed");
    expect(parseHubView("revimpact", "toString")).toBe("computed");
  });

  it("writes a view as hub_view and the default as no param, keeping everything else", () => {
    expect(hubViewSearch("hub_tab=drawings&keep=1", "drawings", "reviews").toString()).toBe("hub_tab=drawings&keep=1&hub_view=reviews");
    expect(hubViewSearch("hub_tab=drawings&hub_view=reviews", "drawings", "sets").toString()).toBe("hub_tab=drawings&hub_view=sets");
    expect(hubViewSearch("hub_tab=drawings&hub_view=sets&keep=1", "drawings", "sheets").toString()).toBe("hub_tab=drawings&keep=1");
    expect(hubViewSearch("hub_tab=revimpact&hub_view=log", "revimpact", "computed").toString()).toBe("hub_tab=revimpact");
  });

  it("doesn't touch its input", () => {
    const prev = new URLSearchParams("hub_tab=drawings&hub_view=sets");
    hubViewSearch(prev, "drawings", "sheets");
    expect(prev.get("hub_view")).toBe("sets");
  });

  it("links the Control Board's needs-attention chips to Sets & revisions", () => {
    expect(hubHref("drawings", { hub_view: "sets" })).toBe("/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets");
  });
});

describe("canonicalHubSearch", () => {
  it.each(LIVE_KEYS)("leaves ?hub_tab=%s alone", (key) => {
    expect(canonicalHubSearch(`?hub_tab=${key}`)).toBeNull();
    expect(canonicalHubSearch(`hub_tab=${key}&projectId=P&recordId=r`)).toBeNull();
  });

  it("leaves a URL with no hub_tab, or an empty one, alone", () => {
    expect(canonicalHubSearch("")).toBeNull();
    expect(canonicalHubSearch("?projectId=P")).toBeNull();
    expect(canonicalHubSearch("?hub_tab=")).toBeNull();
  });

  it("drops only an unknown hub_tab", () => {
    expect(canonicalHubSearch("?hub_tab=bogus")).toBe("");
    expect(canonicalHubSearch("?projectId=P&hub_tab=bogus&recordId=r")).toBe("?projectId=P&recordId=r");
    expect(canonicalHubSearch(new URLSearchParams("hub_tab=register&foo=1"))).toBe("?foo=1");
  });

  it("rewrites ?hub_tab=doccontrol to the Drawing Register's sheet view, keeping the rest", () => {
    expect(canonicalHubSearch("?hub_tab=doccontrol")).toBe("?hub_tab=drawings");
    expect(canonicalHubSearch("?projectId=P&hub_tab=doccontrol&x=1")).toBe("?projectId=P&hub_tab=drawings&x=1");
    // Doc Control never used hub_view; a stray one must not pick another view.
    expect(canonicalHubSearch("?hub_tab=doccontrol&hub_view=reviews")).toBe("?hub_tab=drawings");
  });

  it("rewrites an alias to its target and view, keeping the rest", () => {
    expect(canonicalHubSearch("?hub_tab=oldregister&foo=1", ALIASES)).toBe("?hub_tab=drawings&foo=1&hub_view=sets");
    expect(canonicalHubSearch("?hub_tab=oldhub", ALIASES)).toBe("?hub_tab=drawings");
    // An alias without a view leaves hub_view to the target tab.
    expect(canonicalHubSearch("?hub_tab=oldhub&hub_view=sets", ALIASES)).toBe("?hub_tab=drawings&hub_view=sets");
    // The target's default view is written as no hub_view.
    expect(canonicalHubSearch("?hub_tab=oldsheets&hub_view=reviews", ALIASES)).toBe("?hub_tab=drawings");
    expect(canonicalHubSearch("?hub_tab=matrix", ALIASES)).toBe("?hub_tab=holds");
  });

  it("is stable: a corrected search needs no second correction", () => {
    for (const search of ["?hub_tab=bogus&x=1", "?hub_tab=a&hub_tab=b", "?hub_tab=oldregister", "?hub_tab=oldsheets&hub_view=log", "?hub_tab=oldhub&hub_tab=zzz"]) {
      const fixed = canonicalHubSearch(search, ALIASES);
      expect(fixed).not.toBeNull();
      expect(canonicalHubSearch(fixed ?? "", ALIASES)).toBeNull();
    }
    for (const search of ["?hub_tab=doccontrol", "?hub_tab=doccontrol&hub_view=sets&x=1", "?hub_tab=doccontrol&hub_tab=zzz"]) {
      const fixed = canonicalHubSearch(search);
      expect(fixed).not.toBeNull();
      expect(canonicalHubSearch(fixed ?? "")).toBeNull();
    }
  });
});

describe("record and create links (owner decision 3)", () => {
  it("opens a submittal's record in the Submittal Register", () => {
    expect(submittalRecordHref("s1")).toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=s1");
    expect(submittalRecordHref("a b&c")).toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=a+b%26c");
  });

  it("opens create pre-linked to a set: URL-encoded, and with no new=1", () => {
    expect(createSubmittalHref("set1")).toBe("/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set1");
    expect(createSubmittalHref("a b")).toBe("/DrawingSubmittalHub?hub_tab=submittals&targetSetId=a+b");
    expect(createSubmittalHref("set1")).not.toContain("new=");
  });

  it("sends a triage item to its governing submittal, else its set's Sets & revisions view, else its tab", () => {
    expect(hubHrefForTriageItem({ _submittalId: "s1", _drawingSetId: "set1", routeTab: "drawings" }))
      .toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=s1");
    expect(hubHrefForTriageItem({ _submittalId: "s1", _drawingSetId: null, routeTab: "submittals" }))
      .toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=s1");
    expect(hubHrefForTriageItem({ _submittalId: null, _drawingSetId: "set1", routeTab: "drawings" }))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets&set=set1");
    expect(hubHrefForTriageItem({ _submittalId: null, _drawingSetId: null, routeTab: "drawings" }))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings");
    expect(hubHrefForTriageItem({ routeTab: "matrix" })).toBe("/DrawingSubmittalHub?hub_tab=matrix");
  });

  it("falls back to the Control Board for a missing or unknown tab, and follows a retired key to its home", () => {
    expect(hubHrefForTriageItem({})).toBe("/DrawingSubmittalHub");
    expect(hubHrefForTriageItem({ routeTab: "" })).toBe("/DrawingSubmittalHub");
    expect(hubHrefForTriageItem({ routeTab: "bogus" })).toBe("/DrawingSubmittalHub");
    expect(hubHrefForTriageItem({ routeTab: "doccontrol" })).toBe("/DrawingSubmittalHub?hub_tab=drawings");
  });

  it("sends a Process Board card by the same rule", () => {
    expect(hubHrefForBoardItem({ submittalId: "s1", drawingSetId: "set1", routeTab: "submittals" }))
      .toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=s1");
    expect(hubHrefForBoardItem({ submittalId: null, drawingSetId: "set1", routeTab: "drawings" }))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets&set=set1");
    expect(hubHrefForBoardItem({ submittalId: null, drawingSetId: null, routeTab: "drawings" }))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings");
    expect(hubHrefForBoardItem({ submittalId: null, routeTab: "submittals" }))
      .toBe("/DrawingSubmittalHub?hub_tab=submittals");
  });
});
