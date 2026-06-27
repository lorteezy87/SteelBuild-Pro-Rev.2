// node environment — no jsdom needed
import { describe, it, expect, beforeEach } from "vitest";
import { load, save, pushRow } from "../tapeStore";

/** Minimal in-memory localStorage stand-in */
function makeStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach((k) => delete data[k]); },
    _data: data,
  };
}

// ── pushRow ────────────────────────────────────────────────────────────────

describe("pushRow", () => {
  it("prepends the entry to the front of the array", () => {
    const result = pushRow(["b", "c"], "a", 10);
    expect(result[0]).toBe("a");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("caps the array at the given limit", () => {
    const rows = [1, 2, 3, 4, 5];
    const result = pushRow(rows, 0, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(0);
    // oldest entry (5) should be dropped
    expect(result).not.toContain(5);
  });

  it("does not mutate the original array", () => {
    const original = ["x", "y"];
    pushRow(original, "z", 10);
    expect(original).toEqual(["x", "y"]);
  });

  it("returns a single-element array when pushing onto empty array", () => {
    const result = pushRow([], "first", 10);
    expect(result).toEqual(["first"]);
  });

  it("caps correctly when limit is 1", () => {
    const result = pushRow(["old"], "new", 1);
    expect(result).toEqual(["new"]);
  });

  it("handles object entries", () => {
    const entry = { expr: "2+2", value: 4, ts: 1000 };
    const result = pushRow([], entry, 10);
    expect(result[0]).toEqual(entry);
  });
});

// ── save + load round-trip ──────────────────────────────────────────────────

describe("save + load round-trip", () => {
  let store;
  beforeEach(() => {
    store = makeStorage();
  });

  it("saves and reloads an array of objects", () => {
    const rows = [
      { expr: "3*3", value: 9, ts: 2000 },
      { expr: "1+1", value: 2, ts: 1000 },
    ];
    save("myCalc", rows, store);
    const reloaded = load("myCalc", store);
    expect(reloaded).toEqual(rows);
  });

  it("saves and reloads an empty array", () => {
    save("myCalc", [], store);
    const reloaded = load("myCalc", store);
    expect(reloaded).toEqual([]);
  });

  it("reloads primitive arrays too", () => {
    save("nums", [1, 2, 3], store);
    expect(load("nums", store)).toEqual([1, 2, 3]);
  });
});

// ── load edge-cases ─────────────────────────────────────────────────────────

describe("load", () => {
  let store;
  beforeEach(() => {
    store = makeStorage();
  });

  it("returns [] when key is missing", () => {
    expect(load("nonexistent", store)).toEqual([]);
  });

  it("returns [] on invalid JSON", () => {
    store.setItem("bad", "not-json{{");
    expect(load("bad", store)).toEqual([]);
  });

  it("returns [] when stored value is a non-array JSON value", () => {
    store.setItem("obj", JSON.stringify({ not: "an array" }));
    expect(load("obj", store)).toEqual([]);
  });

  it("returns [] when stored value is null JSON literal", () => {
    store.setItem("nullkey", "null");
    expect(load("nullkey", store)).toEqual([]);
  });

  it("returns [] when storage is null (node env without window)", () => {
    expect(load("anykey", null)).toEqual([]);
  });
});

// ── save edge-cases ─────────────────────────────────────────────────────────

describe("save", () => {
  it("silently does nothing when storage is null", () => {
    // should not throw
    expect(() => save("key", [1, 2, 3], null)).not.toThrow();
  });

  it("overwrites a previous value for the same key", () => {
    const store = makeStorage();
    save("k", ["first"], store);
    save("k", ["second"], store);
    expect(load("k", store)).toEqual(["second"]);
  });
});
