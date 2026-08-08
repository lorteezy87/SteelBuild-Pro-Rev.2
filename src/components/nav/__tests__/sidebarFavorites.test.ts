import { describe, expect, it } from "vitest";
import { mergeLegacyFavorites, toggleServerFavorite } from "../sidebarFavorites";

describe("sidebar favorite persistence", () => {
  it("merges legacy local favorites into server-backed preferences once", () => {
    expect(mergeLegacyFavorites(["Projects", "RFIs"], ["RFIs", "Drawings"])).toEqual([
      "ProjectsHub",
      "RFIs",
      "DrawingSubmittalHub",
    ]);
  });

  it("toggles a module in the canonical server-backed list", () => {
    expect(toggleServerFavorite(["ProjectsHub"], "RFIs")).toEqual(["ProjectsHub", "RFIs"]);
    expect(toggleServerFavorite(["ProjectsHub", "RFIs"], "ProjectsHub")).toEqual(["RFIs"]);
  });
});
