import { describe, expect, it } from "vitest";
import { NAVIGATION_FAVORITE_IDS, normalizeNavigationFavorites } from "../navigationFavorites";
import { PERSONALIZATION_PRESETS } from "../presets";

describe("navigation favorites", () => {
  it("uses canonical sidebar route ids", () => {
    expect(NAVIGATION_FAVORITE_IDS).toContain("ProjectsHub");
    expect(NAVIGATION_FAVORITE_IDS).toContain("DrawingSubmittalHub");
    expect(NAVIGATION_FAVORITE_IDS).not.toContain("Projects");
    expect(NAVIGATION_FAVORITE_IDS).not.toContain("Drawings");
  });

  it("migrates legacy labels and removes duplicates or unavailable pages", () => {
    expect(normalizeNavigationFavorites(["Projects", "ProjectsHub", "Drawings", "RFIs", "Missing"])).toEqual([
      "ProjectsHub",
      "DrawingSubmittalHub",
      "RFIs",
    ]);
  });

  it("keeps every preset favorite resolvable by the sidebar", () => {
    for (const preset of Object.values(PERSONALIZATION_PRESETS)) {
      expect(preset.pinned_modules.every((id) => NAVIGATION_FAVORITE_IDS.includes(id))).toBe(true);
    }
  });
});
