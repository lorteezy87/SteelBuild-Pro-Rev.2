import { describe, expect, it } from "vitest";
import { buildFolderBreadcrumbPath } from "../documentsPageHelpers";

describe("buildFolderBreadcrumbPath", () => {
  it("walks parent chain and stops at root", () => {
    const folders = [
      { id: "a", name: "A", parent_folder_id: null },
      { id: "b", name: "B", parent_folder_id: "a" },
      { id: "c", name: "C", parent_folder_id: "b" },
    ];
    expect(buildFolderBreadcrumbPath(folders, null)).toEqual([]);
    expect(buildFolderBreadcrumbPath(folders, "c").map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("bounds depth against cycles", () => {
    const folders = [
      { id: "a", parent_folder_id: "b" },
      { id: "b", parent_folder_id: "a" },
    ];
    const path = buildFolderBreadcrumbPath(folders as any, "a");
    expect(path.length).toBeLessThanOrEqual(50);
  });
});
