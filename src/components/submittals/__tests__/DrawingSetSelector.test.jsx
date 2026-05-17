// Tests for DrawingSetSelector pure helpers. The component itself is
// thin presentational glue — the interesting logic is in
// filterDrawingSets / toggleSetId, which we cover here. (Vitest is
// configured with environment: 'node' and the codebase has no DOM
// testing library, so we deliberately scope to the pure helpers.)

import { describe, it, expect } from "vitest";
import {
  filterDrawingSets,
  toggleSetId,
} from "../DrawingSetSelector.jsx";

describe("filterDrawingSets", () => {
  const sets = [
    { id: "a", set_name: "Steel Shop Drawings", discipline: "Structural", revision: "2" },
    { id: "b", set_name: "Foundations", discipline: "Civil", revision: "0" },
    { id: "c", set_name: "Steel Misc", discipline: "Structural", revision: "1", is_deleted: true },
    { id: "d", set_name: "MEP Coordination", discipline: "Mechanical", revision: "1" },
  ];

  it("returns live (non-deleted) sets in package sort order when query is empty", () => {
    const out = filterDrawingSets(sets, "");
    expect(out.map((s) => s.id)).toEqual(["b", "d", "a"]);
  });

  it("filters by name (case-insensitive substring)", () => {
    const out = filterDrawingSets(sets, "steel");
    // 'a' matches; 'c' is soft-deleted and must be excluded.
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("filters by discipline", () => {
    const out = filterDrawingSets(sets, "civil");
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by revision token (R<n>)", () => {
    const out = filterDrawingSets(sets, "r2");
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("returns [] when nothing matches", () => {
    const out = filterDrawingSets(sets, "zzzzz");
    expect(out).toEqual([]);
  });

  it("handles empty/null inputs gracefully", () => {
    expect(filterDrawingSets(null, "x")).toEqual([]);
    expect(filterDrawingSets(undefined, "")).toEqual([]);
    expect(filterDrawingSets([], "anything")).toEqual([]);
  });
});

describe("toggleSetId", () => {
  it("adds an id when absent", () => {
    expect(toggleSetId([], "a")).toEqual(["a"]);
    expect(toggleSetId(["b"], "a")).toEqual(["b", "a"]);
  });

  it("removes an id when present", () => {
    expect(toggleSetId(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleSetId(["a"], "a")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const start = ["a", "b"];
    const next = toggleSetId(start, "c");
    expect(start).toEqual(["a", "b"]);
    expect(next).toEqual(["a", "b", "c"]);
  });

  it("treats non-array value as empty", () => {
    expect(toggleSetId(undefined, "a")).toEqual(["a"]);
    expect(toggleSetId(null, "a")).toEqual(["a"]);
  });

  it("ignores empty/null id", () => {
    expect(toggleSetId(["a"], "")).toEqual(["a"]);
    expect(toggleSetId(["a"], null)).toEqual(["a"]);
  });
});
