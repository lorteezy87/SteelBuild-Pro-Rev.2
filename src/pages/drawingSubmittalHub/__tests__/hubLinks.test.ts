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
  canonicalHubSearch,
  hubHref,
  nextTabSearch,
  parseHubTab,
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

// A stand-in alias table. None ship yet, but the redirect path must work, and
// an alias must win over a same-named key (that's how a key gets retired).
const ALIASES: HubTabAliases = {
  oldregister: { tab: "drawings", view: "sets" },
  doccontrol: { tab: "drawings" },
};

describe("hub route and tab keys", () => {
  it("points at the registered hub page", () => {
    expect(HUB_PATH).toBe("/DrawingSubmittalHub");
    expect(HUB_PATH).toBe(createPageUrl("DrawingSubmittalHub"));
  });

  it("keeps all 11 historic keys, model3d included", () => {
    expect([...HUB_TAB_KEYS]).toEqual(HISTORIC_KEYS);
    expect(DEFAULT_HUB_TAB).toBe("overview");
  });

  it("knows every tab the hub renders", () => {
    for (const tab of TABS) expect(HUB_TAB_KEYS).toContain(tab.key);
  });

  it("only aliases to real keys that aren't aliases themselves, so a redirect can't chain or loop", () => {
    for (const alias of Object.values(HUB_TAB_ALIASES)) {
      expect(HUB_TAB_KEYS).toContain(alias.tab);
      expect(Object.prototype.hasOwnProperty.call(HUB_TAB_ALIASES, alias.tab)).toBe(false);
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
  it.each(HISTORIC_KEYS)("%s parses to itself", (key) => {
    expect(parseHubTab(key)).toEqual({ tab: key, known: true, aliasedFrom: null, view: null });
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
    expect(parseHubTab("doccontrol", ALIASES)).toEqual({ tab: "drawings", known: true, aliasedFrom: "doccontrol", view: null });
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

  it("spells out the Control Board, and adds hub_tab to a bare URL", () => {
    expect(nextTabSearch("hub_tab=matrix", "overview").toString()).toBe("hub_tab=overview");
    expect(nextTabSearch("", "holds").toString()).toBe("hub_tab=holds");
  });
});

describe("canonicalHubSearch", () => {
  it.each(HISTORIC_KEYS)("leaves ?hub_tab=%s alone", (key) => {
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

  it("rewrites an alias to its target, and view, keeping the rest", () => {
    expect(canonicalHubSearch("?hub_tab=oldregister&foo=1", ALIASES)).toBe("?hub_tab=drawings&foo=1&hub_view=sets");
    expect(canonicalHubSearch("?hub_tab=doccontrol", ALIASES)).toBe("?hub_tab=drawings");
  });

  it("is stable: a corrected search needs no second correction", () => {
    for (const search of ["?hub_tab=bogus&x=1", "?hub_tab=a&hub_tab=b", "?hub_tab=oldregister", "?hub_tab=doccontrol&hub_tab=zzz"]) {
      const fixed = canonicalHubSearch(search, ALIASES);
      expect(fixed).not.toBeNull();
      expect(canonicalHubSearch(fixed ?? "", ALIASES)).toBeNull();
    }
  });
});
