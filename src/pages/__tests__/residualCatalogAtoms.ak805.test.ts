import { describe, expect, it } from "vitest";
import {
  RAIL_LS_KEY,
  RECENTS_LS_KEY,
  FAVORITES_LS_KEY,
  loadRailState,
  saveRailState,
  loadRecents,
  saveRecents,
  loadFavorites,
  saveFavorites,
} from "@/components/nav/sidebarNavHelpers";
import {
  EXPAND_LS_KEY,
  loadExpandedSets,
  saveExpandedSets,
  approvalPillTone,
} from "@/components/drawings/drawingsGridHelpers";
import {
  PROJECTS_CACHE_KEY,
  readProjectsCache,
  writeProjectsCache,
  isLiveProject,
} from "@/components/shared/projectContextHelpers";
import { formatBackchargeMoney } from "@/pages/backcharges/backchargeControlCenterHelpers";

describe("residual catalog atoms batch AK", () => {
  it("sidebar storage keys and round-trip helpers", () => {
    expect(RAIL_LS_KEY).toContain("sidebar");
    expect(RECENTS_LS_KEY).toContain("recents");
    expect(FAVORITES_LS_KEY).toContain("favorites");
    // node env: localStorage may be undefined — helpers should not throw
    expect(() => saveRailState(true)).not.toThrow();
    expect(typeof loadRailState()).toBe("boolean");
    expect(() => saveRecents(["Dashboard"])).not.toThrow();
    expect(Array.isArray(loadRecents())).toBe(true);
    expect(() => saveFavorites(["RFIs"])).not.toThrow();
    expect(Array.isArray(loadFavorites())).toBe(true);
  });

  it("drawings grid expand storage and approval pill tones", () => {
    expect(EXPAND_LS_KEY).toContain("drawings");
    expect(() => saveExpandedSets(new Set(["a"]))).not.toThrow();
    const loaded = loadExpandedSets();
    expect(loaded === null || loaded instanceof Set).toBe(true);
    expect(approvalPillTone(null)).toBeNull();
    expect(approvalPillTone("approved")?.color).toBe("var(--status-success)");
    expect(approvalPillTone("rejected")?.color).toBe("var(--status-error)");
    expect(approvalPillTone("pending_review")?.color).toBe("var(--status-warning)");
    expect(approvalPillTone("other")?.color).toBe("var(--text-muted)");
  });

  it("project cache key helpers and backcharge money", () => {
    expect(PROJECTS_CACHE_KEY).toBe("sbp_projects_cache");
    expect(isLiveProject({ is_deleted: false })).toBe(true);
    expect(isLiveProject({ is_deleted: true })).toBe(false);
    expect(() => writeProjectsCache([])).not.toThrow();
    expect(Array.isArray(readProjectsCache())).toBe(true);
    expect(formatBackchargeMoney(null as any)).toBe("$—");
    expect(formatBackchargeMoney(0)).toBe("$0");
    expect(formatBackchargeMoney(1200)).toMatch(/^\$/);
  });
});
