import { describe, expect, it } from "vitest";
import { ALL_MODULES, NAV_GROUPS, PRIMARY_TABS, SIDEBAR_GROUPS } from "@/config/moduleRegistry";
import { LAUNCHER_MODULES, searchModules } from "@/config/launcherConfig";
import { ALL_ROUTE_PATHS, getPageDomain, PROJECT_SCOPED_PAGES, routeLabel, validateRoutes } from "@/config/routes";
import { isGatedPage } from "@/config/moduleGating";
import { FallbackIcon, getPageIcon } from "@/config/pageIcons";

describe("IFC viewer navigation", () => {
  it("is named consistently in desktop, mobile, and All Modules navigation", () => {
    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      expect(groups.find((group: { label: string }) => group.label === "DETAILING")?.items)
        .toEqual(expect.arrayContaining([expect.objectContaining({ page: "IfcModelViewer", label: "IFC 3D Viewer" })]));
    }
    expect(ALL_MODULES).toEqual(expect.arrayContaining([expect.objectContaining({ page: "IfcModelViewer", name: "IFC 3D Viewer" })]));
    expect(LAUNCHER_MODULES).toEqual(expect.arrayContaining([expect.objectContaining({ page: "IfcModelViewer", label: "IFC 3D Viewer" })]));
    expect(PRIMARY_TABS.find((tab) => tab.label === "DRAWINGS")?.pages).toContain("IfcModelViewer");
    expect(getPageIcon("IfcModelViewer")).not.toBe(FallbackIcon);
  });

  it.each(["IFC", "3D", "BIM", "model"])("can be found by searching %s", (query) => {
    expect(searchModules(query)).toEqual(expect.arrayContaining([expect.objectContaining({ page: "IfcModelViewer" })]));
  });

  it("uses project route protection and preserves discoverability independently of the viewer body flag", async () => {
    expect(ALL_ROUTE_PATHS).toContain("/IfcModelViewer");
    expect(PROJECT_SCOPED_PAGES.has("IfcModelViewer")).toBe(true);
    expect(routeLabel("IfcModelViewer")).toBe("IFC 3D Viewer");
    expect(getPageDomain("IfcModelViewer")).toBe("documents");
    // The existing hub owns viewer_3d loading, retry, and disabled notices.
    // Hiding this link behind that flag makes the viewer impossible to find.
    expect(isGatedPage("IfcModelViewer")).toBe(false);
    expect(await validateRoutes()).toEqual([]);
  });
});
