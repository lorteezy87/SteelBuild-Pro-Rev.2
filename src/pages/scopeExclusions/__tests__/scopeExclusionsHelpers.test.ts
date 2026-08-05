import { describe, expect, it } from "vitest";
import {
  filterScopeItems,
  computeScopeStats,
  commandBarSubtitle,
  hasActiveScopeFilters,
  nextSelectedIds,
  bulkSuccessMessage,
  buildCompleteToggleData,
  buildInProgressToggleData,
  bulkMarkCompletePatch,
} from "../scopeExclusionsHelpers";

describe("scopeExclusionsHelpers", () => {
  const items = [
    { item_type: "Scope", category: "Structural", description: "W14 columns", is_completed: false, notes: "" },
    { item_type: "Exclusion", category: "Coatings", description: "Fireproofing by others", is_completed: true, notes: "see addendum" },
    { item_type: "Clarification", category: "Erection", description: "Night pour", is_completed: false, notes: "", added_by: "PM" },
  ];

  it("filters by type, category, search, hideCompleted", () => {
    expect(filterScopeItems(items, { filterType: "Scope", filterCategory: "all", search: "", hideCompleted: false })).toHaveLength(1);
    expect(filterScopeItems(items, { filterType: "all", filterCategory: "Coatings", search: "", hideCompleted: false })).toHaveLength(1);
    expect(filterScopeItems(items, { filterType: "all", filterCategory: "all", search: "fire", hideCompleted: false })).toHaveLength(1);
    expect(filterScopeItems(items, { filterType: "all", filterCategory: "all", search: "", hideCompleted: true })).toHaveLength(2);
    expect(filterScopeItems(items, { filterType: "all", filterCategory: "all", search: "pm", hideCompleted: false })).toHaveLength(1);
  });

  it("computes stats and subtitle", () => {
    const stats = computeScopeStats(items);
    expect(stats).toEqual({ total: 3, scope: 1, exclusion: 1, clarification: 1, completed: 1 });
    expect(commandBarSubtitle(stats)).toContain("1 complete");
    expect(commandBarSubtitle({ completed: 0 })).not.toContain("complete");
  });

  it("detects active filters and toggles selection", () => {
    expect(hasActiveScopeFilters({ filterType: "all", filterCategory: "all", search: "", hideCompleted: false })).toBe(false);
    expect(hasActiveScopeFilters({ filterType: "Scope", filterCategory: "all", search: "", hideCompleted: false })).toBe(true);
    expect([...nextSelectedIds(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
    expect([...nextSelectedIds(new Set(["a"]), "a")]).toEqual([]);
  });

  it("builds toggle and bulk patches", () => {
    expect(bulkSuccessMessage(1, "Updated")).toBe("Updated 1 item");
    expect(bulkSuccessMessage(2, "Deleted")).toBe("Deleted 2 items");
    const done = buildCompleteToggleData(true, "2026-01-01T00:00:00.000Z");
    expect(done).toMatchObject({ is_completed: true, completed_at: "2026-01-01T00:00:00.000Z", in_progress: false });
    expect(buildCompleteToggleData(false, "t")).toEqual({ is_completed: false, completed_at: null });
    expect(buildInProgressToggleData(true, "t")).toEqual({ in_progress: true, in_progress_at: "t" });
    expect(bulkMarkCompletePatch("t").is_completed).toBe(true);
  });
});
