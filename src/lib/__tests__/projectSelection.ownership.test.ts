// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_PROJECT_ID_KEY, PROJECTS_CACHE_KEY, hasResolvableProjectSelection,
  readOwnedProjects, writeOwnedProjects,
} from "../projectSelection";

const owner = { userId: "alice", orgId: "fabricator-a" };
const project = { id: "job-a", org_id: "fabricator-a", name: "Confidential job" };
beforeEach(() => localStorage.clear());

describe("owned project cache", () => {
  it("restores the same account/workspace and ignores archived or foreign rows", () => {
    writeOwnedProjects([
      project, { id: "archived", org_id: owner.orgId, is_deleted: true },
      { id: "foreign", org_id: "other" },
    ], owner);
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, project.id);
    expect(readOwnedProjects(owner)).toEqual([project]);
    expect(hasResolvableProjectSelection(owner)).toBe(true);
  });

  it("never restores another user, another workspace, or an unresolved identity", () => {
    writeOwnedProjects([project], owner);
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, project.id);
    for (const scope of [null, { ...owner, userId: "bob" }, { ...owner, orgId: "erector-b" }]) {
      expect(readOwnedProjects(scope)).toEqual([]);
      expect(hasResolvableProjectSelection(scope)).toBe(false);
    }
  });

  it("rejects ownerless legacy arrays and malformed envelopes", () => {
    for (const value of [[project], { version: 2, owner, projects: {} }, { version: 1, owner, projects: [project] }]) {
      localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(value));
      expect(readOwnedProjects(owner)).toEqual([]);
    }
  });

  it("does not claim a missing saved project is pending", () => {
    writeOwnedProjects([project], owner);
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, "removed");
    expect(hasResolvableProjectSelection(owner)).toBe(false);
    writeOwnedProjects([], owner);
    expect(localStorage.getItem(PROJECTS_CACHE_KEY)).toBeNull();
  });
});
