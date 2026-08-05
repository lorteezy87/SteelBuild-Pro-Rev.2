import { describe, expect, it } from "vitest";
import {
  filterQuickNavModules,
  buildSearchDisplayItems,
  runCachedGlobalSearch,
  ICON_MAP,
  COLOR_MAP,
  QUICK_NAV,
  SCOPE_OPTIONS,
} from "../globalSearchHelpers";

const NAV = [
  { name: "Projects", page: "Projects", group: "Core" },
  { name: "Drawings", page: "Drawings", group: "Docs" },
];

describe("filterQuickNavModules", () => {
  it("returns all when empty query", () => {
    expect(filterQuickNavModules(NAV, "")).toHaveLength(2);
  });
  it("filters by name under 2 chars", () => {
    expect(filterQuickNavModules(NAV, "p").map((m) => m.name)).toEqual(["Projects"]);
  });
  it("clears modules when query length >= 2", () => {
    expect(filterQuickNavModules(NAV, "pr")).toEqual([]);
  });
});

describe("buildSearchDisplayItems", () => {
  it("prefers search results", () => {
    const results = [{ id: "1", title: "Hit" }];
    expect(buildSearchDisplayItems(results as any, NAV)).toEqual(results);
  });
  it("maps modules when no results", () => {
    const items = buildSearchDisplayItems([], NAV) as any[];
    expect(items[0]).toMatchObject({ type: "Module", title: "Projects", page: "Projects" });
  });
});

describe("runCachedGlobalSearch", () => {
  const caches = {
    projects: [
      { id: "p1", name: "Alpha Tower", project_number: "2401", phase: "Fab", health_status: "Green" },
      { id: "p2", name: "Beta Yard", project_number: "2402", phase: "Install", health_status: "Amber" },
    ],
    rfis: [
      {
        id: "r1",
        rfi_number: "RFI-1",
        title: "Embed plate",
        description: "detail",
        project_id: "p1",
        project_name: "Alpha",
        status: "Open",
        priority: "High",
      },
    ],
    drawings: [
      {
        id: "d1",
        sheet_number: "S-101",
        title: "Foundation",
        project_id: "p1",
        project_name: "Alpha",
        stage: "IFC",
      },
    ],
    workPackages: [
      {
        id: "w1",
        wp_number: "WP-01",
        name: "Columns",
        project_id: "p1",
        project_name: "Alpha",
        status: "Released",
      },
    ],
    changeOrders: [
      {
        id: "c1",
        co_number: "CO-01",
        title: "Extra embeds",
        project_id: "p2",
        project_name: "Beta",
        status: "Submitted",
      },
    ],
    contacts: [
      {
        id: "ct1",
        first_name: "Jane",
        last_name: "Doe",
        company: "Acme Steel",
        role: "PM",
        email: "jane@acme.com",
        contact_type: "Client",
        project_id: "p1",
      },
    ],
  };

  it("returns empty for short query", () => {
    expect(runCachedGlobalSearch({ query: "a", searchScope: "all", caches })).toEqual([]);
  });

  it("matches projects by name", () => {
    const out = runCachedGlobalSearch({ query: "alpha", searchScope: "all", caches });
    expect(out.some((r) => r.type === "Project" && r.id === "p1")).toBe(true);
  });

  it("scopes entity hits to active project", () => {
    const out = runCachedGlobalSearch({
      query: "embed",
      searchScope: "project",
      activeProjectId: "p1",
      caches,
    });
    expect(out.some((r) => r.type === "RFI")).toBe(true);
    expect(out.some((r) => r.type === "ChangeOrder")).toBe(false);
  });

  it("contacts-only mode includes email match", () => {
    const out = runCachedGlobalSearch({
      query: "jane@acme",
      searchScope: "contacts",
      caches,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("Contact");
    expect(out[0].title).toBe("Jane Doe");
  });
});

describe("search chrome maps", () => {
  it("icon and color maps", () => {
    expect(ICON_MAP.RFI).toBe("⚑");
    expect(COLOR_MAP.Drawing).toBe("#0EA5E9");
    expect(COLOR_MAP.Module).toBe("var(--accent)");
  });
});

describe("QUICK_NAV / SCOPE_OPTIONS", () => {
  it("exports chrome constants", () => {
    expect(QUICK_NAV.length).toBeGreaterThan(5);
    expect(SCOPE_OPTIONS[0].key).toBe("project");
  });
});
