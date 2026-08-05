import { describe, expect, it } from "vitest";
import { filterResourcesCatalog } from "../resourcesControlCenter.derive";

describe("filterResourcesCatalog", () => {
  const resources = [
    { name: "Crane 1", role: "Operator", resource_type: "Equipment" },
    { name: "Crew A", role: "Welder", resource_type: "Labor" },
  ];
  it("filters type and search", () => {
    expect(filterResourcesCatalog(resources, { typeFilter: "Labor" })).toHaveLength(1);
    expect(filterResourcesCatalog(resources, { search: "crane" })).toHaveLength(1);
  });
});
