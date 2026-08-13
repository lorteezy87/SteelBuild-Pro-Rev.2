import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  canManageFolderLinks,
  canOrganizeFolders,
  computeAccessImpact,
  defaultLinkModeForParent,
  isIndependentlyLinked,
  resolveEffectiveJobIds,
  siblingNameConflict,
  userCanAccessEffectiveJobs,
  wouldCreateCycle,
} from "../domain";
import type { NoteFolder } from "../types";

const folder = (
  partial: Partial<NoteFolder> & Pick<NoteFolder, "id" | "name" | "link_mode">,
): NoteFolder => ({
  org_id: "org-1",
  parent_folder_id: null,
  is_system: false,
  version: 1,
  created_by: "u1",
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T00:00:00Z",
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  ...partial,
});

const general = folder({ id: "gen", name: "General Notes", link_mode: "independent", is_system: true });
const multi = folder({ id: "multi", name: "Multi-site", link_mode: "independent" });
const child = folder({
  id: "child",
  name: "Tucson daily",
  link_mode: "inherited",
  parent_folder_id: "multi",
});
const independentChild = folder({
  id: "indie",
  name: "Phoenix only",
  link_mode: "independent",
  parent_folder_id: "multi",
});

const folders = [general, multi, child, independentChild];
const links = [
  { folder_id: "multi", project_id: "tucson" },
  { folder_id: "multi", project_id: "phoenix" },
  { folder_id: "indie", project_id: "phoenix" },
];

describe("resolveEffectiveJobIds", () => {
  it("treats an unlinked independent folder as a general-notes folder", () => {
    expect(resolveEffectiveJobIds("gen", folders, links)).toEqual([]);
  });

  it("inherits job links from the nearest independent ancestor", () => {
    expect(resolveEffectiveJobIds("child", folders, links)).toEqual(["phoenix", "tucson"]);
  });

  it("uses the child's own links when independently linked", () => {
    expect(resolveEffectiveJobIds("indie", folders, links)).toEqual(["phoenix"]);
    expect(isIndependentlyLinked(independentChild)).toBe(true);
    expect(isIndependentlyLinked(child)).toBe(false);
  });
});

describe("userCanAccessEffectiveJobs — every-job rule", () => {
  it("denies non-members even for general folders", () => {
    expect(userCanAccessEffectiveJobs([], ["tucson"], false)).toBe(false);
  });

  it("allows org members into an unlinked general folder", () => {
    expect(userCanAccessEffectiveJobs([], ["tucson"], true)).toBe(true);
  });

  it("requires current access to every linked job", () => {
    expect(userCanAccessEffectiveJobs(["tucson", "phoenix"], ["tucson"], true)).toBe(false);
    expect(userCanAccessEffectiveJobs(["tucson", "phoenix"], ["tucson", "phoenix"], true)).toBe(true);
    expect(userCanAccessEffectiveJobs(["tucson", "phoenix"], ["tucson", "phoenix", "yuma"], true)).toBe(true);
  });

  it("revokes access when any linked job is removed from the user's set", () => {
    const effective = ["tucson", "phoenix"];
    expect(userCanAccessEffectiveJobs(effective, ["tucson", "phoenix"], true)).toBe(true);
    expect(userCanAccessEffectiveJobs(effective, ["phoenix"], true)).toBe(false);
  });
});

describe("hierarchy guards", () => {
  it("detects move cycles", () => {
    expect(wouldCreateCycle("multi", "child", folders)).toBe(true);
    expect(wouldCreateCycle("child", "gen", folders)).toBe(false);
    expect(wouldCreateCycle("child", "child", folders)).toBe(true);
  });

  it("flags sibling name collisions and allows the same name under another parent", () => {
    expect(siblingNameConflict("Multi-site", null, folders)).toBe(true);
    expect(siblingNameConflict("multi-site", null, folders, "multi")).toBe(false);
    expect(siblingNameConflict("Multi-site", "gen", folders)).toBe(false);
  });

  it("defaults new subfolders to inherited links", () => {
    expect(defaultLinkModeForParent(null)).toBe("independent");
    expect(defaultLinkModeForParent("multi")).toBe("inherited");
  });
});

describe("access impact preview", () => {
  it("marks added jobs as tightening and removed jobs as loosening", () => {
    const impact = computeAccessImpact(["tucson"], ["tucson", "phoenix"]);
    expect(impact.addedJobIds).toEqual(["phoenix"]);
    expect(impact.removedJobIds).toEqual([]);
    expect(impact.accessTightens).toBe(true);
    expect(impact.accessLoosens).toBe(false);
  });

  it("treats unlinking every job as loosening to a general folder", () => {
    const impact = computeAccessImpact(["tucson"], []);
    expect(impact.accessLoosens).toBe(true);
    expect(impact.removedJobIds).toEqual(["tucson"]);
  });
});

describe("roles", () => {
  it("lets notes editors organize folders but only PM/admin change job links", () => {
    expect(canOrganizeFolders("field")).toBe(true);
    expect(canOrganizeFolders("viewer")).toBe(false);
    expect(canManageFolderLinks("field")).toBe(false);
    expect(canManageFolderLinks("pm")).toBe(true);
    expect(canManageFolderLinks("admin")).toBe(true);
  });
});

describe("buildFolderTree", () => {
  it("orders siblings and reports depth", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((node) => `${node.depth}:${node.name}`)).toEqual([
      "0:General Notes",
      "0:Multi-site",
      "1:Phoenix only",
      "1:Tucson daily",
    ]);
  });
});
