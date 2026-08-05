import { describe, expect, it } from "vitest";
import { filterProjectsList } from "../projectsPageHelpers";

describe("filterProjectsList", () => {
  const projects = [
    { name: "Alpha", project_number: "P1", client: "Acme", general_contractor: "GC1", phase: "Fab", health_status: "Green", job_type: "Structural" },
    { name: "Beta", project_number: "P2", client: "Bob", general_contractor: "GC2", phase: "Field", health_status: "Red", job_type: "Misc" },
  ];

  it("filters by search and chips", () => {
    expect(filterProjectsList(projects, { search: "alpha" }).map((p) => p.name)).toEqual(["Alpha"]);
    expect(filterProjectsList(projects, { phaseFilter: "Field" }).map((p) => p.name)).toEqual(["Beta"]);
    expect(filterProjectsList(projects, { healthFilter: "Red", jobTypeFilter: "Misc" })).toHaveLength(1);
    expect(filterProjectsList(projects, { search: "gc2" })).toHaveLength(1);
  });
});
