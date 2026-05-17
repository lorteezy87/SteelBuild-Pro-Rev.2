import { describe, expect, it } from "vitest";
import { buildResourceGuruPlanning, isPersonnelResource } from "../resourcePlanning";

describe("resourcePlanning", () => {
  it("classifies people, crews, and subcontractors as personnel", () => {
    expect(isPersonnelResource({ resource_type: "Person" })).toBe(true);
    expect(isPersonnelResource({ resource_type: "Crew" })).toBe(true);
    expect(isPersonnelResource({ resource_type: "Subcontractor" })).toBe(true);
    expect(isPersonnelResource({})).toBe(true);
    expect(isPersonnelResource({ resource_type: "Equipment" })).toBe(false);
  });

  it("rolls member capacity into parent crew clash detection", () => {
    const resources = [
      { id: "crew-1", name: "Erection Crew", resource_type: "Crew", capacity: 40, availability: "Available" },
      { id: "person-1", name: "Jordan", resource_type: "Person", capacity: 20, parent_resource_id: "crew-1", availability: "Available" },
    ];
    const planning = buildResourceGuruPlanning({
      resources,
      workPackages: [
        {
          id: "wp-1",
          name: "Main steel sequence",
          crew: "Erection Crew",
          scheduled_start_date: "2026-06-01",
          scheduled_end_date: "2026-06-10",
          field_hours_budget: 80,
        },
      ],
      effectiveCapacityById: { "crew-1": 60, "person-1": 20 },
    });

    const crew = planning.rowById.get("crew-1");
    expect(crew.capacityHours).toBe(60);
    expect(crew.assignedHours).toBe(80);
    expect(crew.overAllocated).toBe(true);
    expect(planning.clashCount).toBe(1);
    expect(planning.waitingList[0]).toMatchObject({ type: "clash", resourceId: "crew-1" });
  });

  it("tracks unassigned or undated work as waiting-list demand", () => {
    const planning = buildResourceGuruPlanning({
      resources: [{ id: "person-1", name: "Alex", resource_type: "Person", capacity: 40 }],
      workPackages: [
        { id: "wp-open", name: "Loose steel", field_hours_budget: 16 },
        { id: "wp-dated", name: "Deck install", crew: "Alex", scheduled_start_date: "2026-06-01", field_hours_budget: 8 },
      ],
    });

    expect(planning.waitingList.map((item) => item.type)).toEqual(["unassigned", "unassigned"]);
    expect(planning.personnelCount).toBe(1);
    expect(planning.openCapacityHours).toBe(40);
  });
});
