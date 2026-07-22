import { describe, expect, it } from "vitest";

import { scopeRowsToVisibleProjects } from "../contract";

describe("command-center caller project scope", () => {
  const rows = [
    { id: "rfi-a", project_id: "project-a" },
    { id: "rfi-b", project_id: "project-b" },
  ];

  it("cannot expand caller A visibility by supplying caller B project IDs", () => {
    expect(scopeRowsToVisibleProjects(rows, new Set(["project-a"]), ["project-b"])).toEqual([]);
  });

  it("keeps two callers' visible rows disjoint", () => {
    expect(scopeRowsToVisibleProjects(rows, new Set(["project-a"]))).toEqual([rows[0]]);
    expect(scopeRowsToVisibleProjects(rows, new Set(["project-b"]))).toEqual([rows[1]]);
  });

  it("does not let an opaque cursor change project authorization", () => {
    const callerBRecordIdFromCursor = "rfi-b";
    const visible = scopeRowsToVisibleProjects(rows, new Set(["project-a"]));
    expect(visible.some((row) => row.id === callerBRecordIdFromCursor)).toBe(false);
  });
});
