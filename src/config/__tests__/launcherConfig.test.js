import { describe, it, expect } from "vitest";
import {
  LAUNCHER_MODULES, LAUNCHER_CATEGORIES, DOCK_DEFAULT_PAGES,
  photoFor, modulesForCategory, searchModules, dockModules,
} from "@/config/launcherConfig";
import { NAV_GROUPS, SIDEBAR_GROUPS } from "@/config/moduleRegistry";

describe("launcherConfig", () => {
  it("derives a flat module list with page, label, category", () => {
    expect(LAUNCHER_MODULES.length).toBeGreaterThan(10);
    const dash = LAUNCHER_MODULES.find((m) => m.page === "Dashboard");
    expect(dash).toMatchObject({ page: "Dashboard", category: "COMMAND" });
    expect(typeof dash.label).toBe("string");
  });

  it("categories start with ALL and include each sidebar group", () => {
    expect(LAUNCHER_CATEGORIES[0]).toBe("ALL");
    expect(LAUNCHER_CATEGORIES).toContain("DETAILING");
    expect(LAUNCHER_CATEGORIES).toContain("COMMERCIAL");
  });

  it("dock defaults reference real modules", () => {
    expect(DOCK_DEFAULT_PAGES).toContain("DrawingSubmittalHub");
    for (const page of DOCK_DEFAULT_PAGES) {
      expect(LAUNCHER_MODULES.some((m) => m.page === page)).toBe(true);
    }
  });

  it("photoFor returns the mapped path for known modules, null for unknown", () => {
    expect(photoFor("Dashboard")).toBe("/photos/desktop/Dashboard.webp");
    expect(photoFor("NoSuchPage")).toBeNull();
  });

  it("modulesForCategory filters; ALL returns everything", () => {
    expect(modulesForCategory("ALL").length).toBe(LAUNCHER_MODULES.length);
    const commercial = modulesForCategory("COMMERCIAL");
    expect(commercial.length).toBeGreaterThan(0);
    expect(commercial.every((m) => m.category === "COMMERCIAL")).toBe(true);
  });

  it("searchModules matches label case-insensitively; empty returns all", () => {
    const r = searchModules("deliver");
    expect(r.some((m) => m.page === "Deliveries")).toBe(true);
    expect(searchModules("").length).toBe(LAUNCHER_MODULES.length);
  });

  it("dockModules resolves to known modules", () => {
    const d = dockModules();
    expect(d.length).toBe(DOCK_DEFAULT_PAGES.length);
    expect(d.every((m) => typeof m.page === "string")).toBe(true);
  });

  it("uses the approved primary operating groups in both navigation registries", () => {
    const expected = ["COMMAND", "PROJECTS", "DETAILING", "PRODUCTION", "FIELD", "COMMERCIAL", "REPORTS"];
    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      expect(groups.slice(0, 7).map((group) => group.label)).toEqual(expected);
    }
  });

  it("does not duplicate Integrations in either navigation registry", () => {
    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      expect(groups.flatMap((group) => group.items).some((item) => item.page === "Integrations")).toBe(false);
    }
  });
});
