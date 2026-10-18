import { describe, expect, it } from "vitest";
import {
  MAX_VIEWS,
  loadViews,
  removeView,
  sanitizeViews,
  storageKey,
  storeViews,
  upsertView,
  viewValue,
} from "../savedRegisterViews";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("sanitizeViews", () => {
  it("drops malformed, duplicate and over-limit entries and unsafe filter values", () => {
    const raw = [
      { id: "a", name: "  Out for approval  ", filters: { statusFilter: "OFA", groupBySet: true, bad: 3, "Bad-Key": "x", long: "x".repeat(201) } },
      { id: "a", name: "dupe" },
      { id: "has space", name: "bad id" },
      { id: "b", name: "" },
      null,
      "nope",
    ];
    expect(sanitizeViews(raw)).toEqual([{ id: "a", name: "Out for approval", filters: { statusFilter: "OFA", groupBySet: true } }]);
    expect(sanitizeViews({})).toEqual([]);
    const many = Array.from({ length: MAX_VIEWS + 5 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, filters: {} }));
    expect(sanitizeViews(many)).toHaveLength(MAX_VIEWS);
  });
});

describe("load / store", () => {
  it("round-trips per register and per user", () => {
    const s = memoryStorage();
    expect(storeViews("drawing_register", "u1", [{ id: "a", name: "Mine", filters: { query: "S-1" } }], s)).toBe(true);
    expect(loadViews("drawing_register", "u1", s)).toEqual([{ id: "a", name: "Mine", filters: { query: "S-1" } }]);
    expect(loadViews("drawing_register", "u2", s)).toEqual([]);
    expect(loadViews("submittal_register", "u1", s)).toEqual([]);
    expect(storageKey("drawing_register", null)).toBe("sbp-register-views:v1:drawing_register:anonymous");
  });

  it("treats missing, corrupt or throwing storage as no views", () => {
    expect(loadViews("drawing_register", "u1", null)).toEqual([]);
    const s = memoryStorage();
    s.data.set(storageKey("drawing_register", "u1"), "{not json");
    expect(loadViews("drawing_register", "u1", s)).toEqual([]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadViews("drawing_register", "u1", throwing)).toEqual([]);
    expect(storeViews("drawing_register", "u1", [], throwing)).toBe(false);
    expect(storeViews("drawing_register", "u1", [], null)).toBe(false);
  });
});

describe("upsertView / removeView", () => {
  it("adds, replaces by name case-insensitively, enforces the limit and deletes", () => {
    let n = 0;
    const id = () => `id${++n}`;
    const r1 = upsertView([], "Late approvals", { statusFilter: "OFA" }, id);
    expect(r1).toMatchObject({ ok: true, view: { id: "id1", name: "Late approvals" } });
    if (!("views" in r1)) throw new Error("expected ok");
    const r2 = upsertView(r1.views, "late APPROVALS", { statusFilter: "BFA" }, id);
    if (!("views" in r2)) throw new Error("expected ok");
    expect(r2.views).toEqual([{ id: "id1", name: "late APPROVALS", filters: { statusFilter: "BFA" } }]);
    expect(upsertView(r2.views, "   ", {}, id)).toEqual({ ok: false, reason: "blank-name" });
    const full = Array.from({ length: MAX_VIEWS }, (_, i) => ({ id: `v${i}`, name: `V${i}`, filters: {} }));
    expect(upsertView(full, "One more", {}, id)).toEqual({ ok: false, reason: "limit" });
    expect(upsertView(full, "v3", { query: "x" }, id)).toMatchObject({ ok: true });
    expect(removeView(r2.views, "id1")).toEqual([]);
  });
});

describe("viewValue", () => {
  it("falls back when the saved value is not valid on this project", () => {
    const view = { id: "a", name: "A", filters: { setFilter: "Main Steel", statusFilter: "on_hold", flag: true } };
    expect(viewValue(view, "setFilter", "all", ["all", "Anchor Bolts"])).toBe("all");
    expect(viewValue(view, "setFilter", "all", new Set(["Main Steel"]))).toBe("Main Steel");
    expect(viewValue(view, "statusFilter", "all")).toBe("on_hold");
    expect(viewValue(view, "flag", "x")).toBe("x");
    expect(viewValue(view, "missing", "all")).toBe("all");
  });
});
