/**
 * Unit tests for resourcesControlCenter.derive.ts
 * Pure logic only — no React, no network.
 */
import { describe, it, expect } from "vitest";
import {
  buildResourcesSummary,
  getAvailability,
  type ResourceRecord,
  type WorkPackageRecord,
} from "../resourcesControlCenter.derive";

function makeResource(overrides: Partial<ResourceRecord> = {}): ResourceRecord {
  return {
    id: "r-1",
    name: "Test Resource",
    resource_type: "Person",
    role: "Ironworker",
    availability: "Available",
    capacity: 40,
    cost_rate: null,
    unit: "hr",
    notes: null,
    metadata: null,
    project_id: "proj-1",
    parent_resource_id: null,
    ...overrides,
  };
}

function makeWp(overrides: Partial<WorkPackageRecord> = {}): WorkPackageRecord {
  return {
    id: "wp-1",
    crew: null,
    field_hours_budget: null,
    field_hours_actual: null,
    name: "Foundation Steel",
    phase: null,
    ...overrides,
  };
}

describe("getAvailability", () => {
  it("returns availability column value when set", () => {
    expect(getAvailability(makeResource({ availability: "Allocated" }))).toBe("Allocated");
  });
  it("defaults to Available when null", () => {
    expect(getAvailability(makeResource({ availability: null }))).toBe("Available");
  });
});

describe("buildResourcesSummary — empty inputs", () => {
  it("returns all-zero KPIs on empty lists", () => {
    const s = buildResourcesSummary([], []);
    expect(s.totalResources).toBe(0);
    expect(s.laborPool).toBe(0);
    expect(s.equipmentCount).toBe(0);
    expect(s.overAllocated).toBe(0);
    expect(s.utilizationPct).toBe(0);
    expect(s.laborByTrade).toHaveLength(0);
    expect(s.equipmentStatus).toHaveLength(0);
    expect(s.conflicts).toHaveLength(0);
  });
});

describe("buildResourcesSummary — labor counting", () => {
  it("counts Person, Crew, Labor as labor pool", () => {
    const resources = [
      makeResource({ id: "r-1", resource_type: "Person" }),
      makeResource({ id: "r-2", resource_type: "Crew" }),
      makeResource({ id: "r-3", resource_type: "Labor" }),
      makeResource({ id: "r-4", resource_type: "Equipment" }),
      makeResource({ id: "r-5", resource_type: "Material" }),
    ];
    const s = buildResourcesSummary(resources);
    expect(s.laborPool).toBe(3);
    expect(s.equipmentCount).toBe(1);
    expect(s.totalResources).toBe(5);
  });
});

describe("buildResourcesSummary — utilization", () => {
  it("computes utilization as allocated+committed+over-alloc / countable", () => {
    const resources = [
      makeResource({ id: "r-1", resource_type: "Person", availability: "Allocated" }),
      makeResource({ id: "r-2", resource_type: "Person", availability: "Available" }),
      makeResource({ id: "r-3", resource_type: "Crew", availability: "Committed" }),
      makeResource({ id: "r-4", resource_type: "Person", availability: "Available" }),
    ];
    // 2 active (Allocated + Committed) of 4 countable = 50%
    const s = buildResourcesSummary(resources);
    expect(s.utilizationPct).toBe(50);
  });

  it("excludes Material and Subcontractor from countable base", () => {
    const resources = [
      makeResource({ id: "r-1", resource_type: "Person", availability: "Allocated" }),
      makeResource({ id: "r-2", resource_type: "Material", availability: "Allocated" }),
    ];
    // 1 active of 1 countable (Material excluded) = 100%
    const s = buildResourcesSummary(resources);
    expect(s.utilizationPct).toBe(100);
  });
});

describe("buildResourcesSummary — over-allocation conflicts", () => {
  it("populates conflicts for Over-Allocated resources", () => {
    const resources = [
      makeResource({ id: "r-1", name: "Crane Crew A", availability: "Over-Allocated", resource_type: "Crew" }),
      makeResource({ id: "r-2", name: "Bay 2 Crane", availability: "Over-Allocated", resource_type: "Equipment" }),
      makeResource({ id: "r-3", name: "Welder Bob", availability: "Available", resource_type: "Person" }),
    ];
    const s = buildResourcesSummary(resources);
    expect(s.overAllocated).toBe(2);
    expect(s.conflicts).toHaveLength(2);
    expect(s.overAllocTone).toBe("danger");
  });

  it("sets overAllocTone neutral when no over-allocated resources", () => {
    const s = buildResourcesSummary([makeResource({ availability: "Available" })]);
    expect(s.overAllocTone).toBe("neutral");
  });
});

describe("buildResourcesSummary — WP crew text cross-reference", () => {
  it("links a resource to an assigned WP when crew name matches", () => {
    const resources = [
      makeResource({ id: "r-1", name: "Erection Crew A", resource_type: "Crew", availability: "Over-Allocated" }),
    ];
    const wps = [
      makeWp({ id: "wp-1", crew: "Erection Crew A", name: "Level 2 Steel" }),
    ];
    const s = buildResourcesSummary(resources, wps);
    expect(s.conflicts[0].assignedTo).toBe("Level 2 Steel");
  });

  it("case-insensitive crew name matching", () => {
    const resources = [
      makeResource({ id: "r-1", name: "erection crew A", resource_type: "Crew", availability: "Over-Allocated" }),
    ];
    const wps = [
      makeWp({ id: "wp-1", crew: "Erection Crew A", name: "Level 3 Steel" }),
    ];
    const s = buildResourcesSummary(resources, wps);
    expect(s.conflicts[0].assignedTo).toBe("Level 3 Steel");
  });

  it("returns null assignedTo when no crew match", () => {
    const resources = [
      makeResource({ id: "r-1", name: "Bay 5", resource_type: "Equipment", availability: "Over-Allocated" }),
    ];
    const s = buildResourcesSummary(resources, []);
    expect(s.conflicts[0].assignedTo).toBeNull();
  });
});

describe("buildResourcesSummary — laborByTrade", () => {
  it("groups labor resources by role", () => {
    const resources = [
      makeResource({ id: "r-1", resource_type: "Person", role: "Ironworker", availability: "Allocated" }),
      makeResource({ id: "r-2", resource_type: "Person", role: "Ironworker", availability: "Available" }),
      makeResource({ id: "r-3", resource_type: "Labor", role: "Welder", availability: "Allocated" }),
    ];
    const s = buildResourcesSummary(resources);
    const ironworker = s.laborByTrade.find((t) => t.trade === "Ironworker");
    const welder = s.laborByTrade.find((t) => t.trade === "Welder");
    expect(ironworker?.count).toBe(2);
    expect(ironworker?.available).toBe(1);
    expect(welder?.count).toBe(1);
  });

  it("sorts laborByTrade by count descending", () => {
    const resources = [
      makeResource({ id: "r-1", resource_type: "Person", role: "Welder" }),
      makeResource({ id: "r-2", resource_type: "Person", role: "Ironworker" }),
      makeResource({ id: "r-3", resource_type: "Person", role: "Ironworker" }),
    ];
    const s = buildResourcesSummary(resources);
    expect(s.laborByTrade[0].trade).toBe("Ironworker");
  });

  it("uses Unknown role for resources with null role", () => {
    const resources = [makeResource({ id: "r-1", resource_type: "Person", role: null })];
    const s = buildResourcesSummary(resources);
    expect(s.laborByTrade[0].trade).toBe("Unknown");
  });
});

describe("buildResourcesSummary — utilizationTone", () => {
  it("returns good when 1–69%", () => {
    const resources = Array.from({ length: 5 }, (_, i) =>
      makeResource({ id: `r-${i}`, resource_type: "Person", availability: i < 2 ? "Allocated" : "Available" }),
    );
    // 2/5 = 40%
    const s = buildResourcesSummary(resources);
    expect(s.utilizationTone).toBe("good");
  });

  it("returns warn when 70–89%", () => {
    const resources = Array.from({ length: 10 }, (_, i) =>
      makeResource({ id: `r-${i}`, resource_type: "Person", availability: i < 8 ? "Allocated" : "Available" }),
    );
    // 8/10 = 80%
    const s = buildResourcesSummary(resources);
    expect(s.utilizationTone).toBe("warn");
  });

  it("returns danger when >= 90%", () => {
    const resources = Array.from({ length: 10 }, (_, i) =>
      makeResource({ id: `r-${i}`, resource_type: "Person", availability: i < 9 ? "Over-Allocated" : "Available" }),
    );
    // 9/10 = 90%
    const s = buildResourcesSummary(resources);
    expect(s.utilizationTone).toBe("danger");
  });
});
