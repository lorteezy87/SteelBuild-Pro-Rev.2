import { describe, it, expect } from "vitest";
import { parseDeps, formatPredecessorLabels } from "../scheduleDependencies";

describe("parseDeps", () => {
  it("extracts predecessor ids from link objects", () => {
    expect(
      parseDeps([
        { id: "a", type: "FS", lag_days: 1 },
        { id: "b", type: "SS", lag_days: 0 },
      ])
    ).toEqual(["a", "b"]);
  });

  it("accepts the legacy id-string array", () => {
    expect(parseDeps(["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns [] for empty / invalid input", () => {
    expect(parseDeps(null)).toEqual([]);
    expect(parseDeps("")).toEqual([]);
  });
});

describe("formatPredecessorLabels", () => {
  const tasks = {
    t1: { id: "t1", wbs_code: "2.2", task_name: "Panel Embeds" },
    t2: { id: "t2", task_name: "Long task name without wbs" }, // no wbs_code
  };
  const lookup = (id) => tasks[id];

  it("uses wbs_code when present", () => {
    expect(formatPredecessorLabels(["t1"], lookup)).toBe("2.2");
  });

  it("falls back to a truncated task_name when there is no wbs_code", () => {
    expect(formatPredecessorLabels(["t2"], lookup)).toBe("Long t…");
  });

  it("skips an orphaned dependency and never renders 'undefined'", () => {
    const out = formatPredecessorLabels(["missing"], lookup);
    expect(out).toBe("");
    expect(out).not.toContain("undefined");
  });

  it("keeps valid predecessors and drops orphaned ones in a mix", () => {
    const out = formatPredecessorLabels(["t1", "missing", "t2"], lookup);
    expect(out).toBe("2.2, Long t…");
    expect(out).not.toContain("undefined");
  });

  it("returns '' for empty or non-array input", () => {
    expect(formatPredecessorLabels([], lookup)).toBe("");
    expect(formatPredecessorLabels(null, lookup)).toBe("");
  });

  it("tolerates a missing lookup function", () => {
    expect(formatPredecessorLabels(["t1"], undefined)).toBe("");
  });
});
