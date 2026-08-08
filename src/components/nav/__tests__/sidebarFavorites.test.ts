import { describe, expect, it } from "vitest";
import { mergeLegacyFavorites, toggleServerFavorite } from "../sidebarFavorites";

describe("sidebar favorite persistence", () => {
  it("merges legacy local favorites into server-backed preferences once", () => {
    expect(mergeLegacyFavorites(["Projects", "RFIs"], ["RFIs", "Drawings"])).toEqual([
      "Projects",
      "RFIs",
      "Drawings",
    ]);
  });

  it("toggles a module in the canonical server-backed list", () => {
    expect(toggleServerFavorite(["Projects"], "RFIs")).toEqual(["Projects", "RFIs"]);
    expect(toggleServerFavorite(["Projects", "RFIs"], "Projects")).toEqual(["RFIs"]);
  });
});
