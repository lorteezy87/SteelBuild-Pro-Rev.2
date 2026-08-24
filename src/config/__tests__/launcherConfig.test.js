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
    expect(dash).toMatchObject({ page: "Dashboard", category: "OVERVIEW" });
    expect(typeof dash.label).toBe("string");
  });

  it("categories start with ALL and include each sidebar group", () => {
    expect(LAUNCHER_CATEGORIES[0]).toBe("ALL");
    expect(LAUNCHER_CATEGORIES).toContain("DETAILING");
    expect(LAUNCHER_CATEGORIES).toContain("COST");
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
    const cost = modulesForCategory("COST");
    expect(cost.length).toBeGreaterThan(0);
    expect(cost.every((m) => m.category === "COST")).toBe(true);
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

  it("lists Email Inbox in both Project Management navigation registries", () => {
    const expected = { label: "Email Inbox", icon: "✉", page: "EmailInbox" };

    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      const projectManagement = groups.find((group) => group.label === "PROJECT MANAGEMENT");
      expect(projectManagement?.items).toContainEqual(expected);
    }
  });

  it("lists Production Notes in both Project Management navigation registries", () => {
    const expected = { label: "Production Notes", icon: "📝", page: "ProductionNotes" };

    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      const projectManagement = groups.find((group) => group.label === "PROJECT MANAGEMENT");
      expect(projectManagement?.items).toContainEqual(expected);
    }
  });

  it("gives RFIs a separate navigation section with both registers", () => {
    const expected = [
      { label: "RFI Register", icon: "⚑", page: "RFIs", badgeKey: "rfi" },
      { label: "Detail Queries", icon: "?", page: "DetailQueries" },
    ];

    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      const rfiGroup = groups.find((group) => group.label === "RFIs");
      const projectManagement = groups.find((group) => group.label === "PROJECT MANAGEMENT");

      expect(rfiGroup?.items).toEqual(expected);
      expect(projectManagement?.items.some((item) => item.page === "RFIs")).toBe(false);
    }
  });

  it("does not duplicate Integrations in either navigation registry", () => {
    for (const groups of [NAV_GROUPS, SIDEBAR_GROUPS]) {
      expect(groups.flatMap((group) => group.items).some((item) => item.page === "Integrations")).toBe(false);
    }
  });
});
