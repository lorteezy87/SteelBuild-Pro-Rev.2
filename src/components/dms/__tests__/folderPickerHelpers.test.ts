import { describe, expect, it } from "vitest";
import { buildTree, collectFolderAndDescendants } from "../folderPickerHelpers";

describe("folder tree", () => {
  const folders = [
    { id: "r", name: "Root", parent_folder_id: null },
    { id: "a", name: "A", parent_folder_id: "r" },
    { id: "b", name: "B", parent_folder_id: "a" },
  ];
  it("indexes by parent", () => {
    const tree = buildTree(folders as any);
    expect(tree.get(null)?.map((f: any) => f.id)).toEqual(["r"]);
    expect(tree.get("r")?.map((f: any) => f.id)).toEqual(["a"]);
  });
  it("collects descendants", () => {
    expect([...collectFolderAndDescendants(folders as any, "r")].sort()).toEqual(["a", "b", "r"]);
  });
});
