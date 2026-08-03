// @vitest-environment jsdom

import { createContext } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/ProjectContext", () => ({ ProjectContext: createContext({ projects: [], loading: false, projectLoadError: null }) }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: null }) }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import { bulkCompletionMessage, filterActionsForMetric, filterProjectsForCurrentOrg, parsePlannerMetricFilter, validateSingleProjectBulkSelection } from "../TaskRegisterPage";

describe("Task Register fail-closed scope helpers", () => {
  it("keeps only projects belonging to the active organization", () => {
    expect(filterProjectsForCurrentOrg([
      { id: "project-a", name: "A", org_id: "org-a" },
      { id: "project-b", name: "B", org_id: "org-b" },
    ], "org-a")).toEqual([{ id: "project-a", name: "A" }]);
  });

  it("rejects a multi-project selection before any repository write", () => {
    const repositoryWrite = vi.fn();
    const selection = validateSingleProjectBulkSelection([
      { id: "action-a", project_id: "project-a", status: "Open", priority: "High", archived_at: null },
      { id: "action-b", project_id: "project-b", status: "Open", priority: "High", archived_at: null },
    ], ["action-a", "action-b"]);

    if (!("error" in selection)) repositoryWrite(selection);
    expect(selection).toEqual({ error: "multiple_projects" });
    expect(repositoryWrite).not.toHaveBeenCalled();
  });

  it("reports committed, rollback, and ineligible details without claiming no changes", () => {
    expect(bulkCompletionMessage({
      ok: false,
      completed: [{ id: "action-a" }],
      failed: [{ id: "action-b", reason: "write_error" }],
      ineligible: [{ id: "action-c", reason: "terminal" }],
      rolledBack: [{ id: "action-a", ok: false }],
    })).toContain("Net completed: 0. Rolled back: 0. Rollback failures: 1. Final state uncertain: 1.");
  });

  it("does not report completion when every completed action was rolled back", () => {
    expect(bulkCompletionMessage({ ok: false, completed: [{ id: "action-a" }], failed: [], ineligible: [], rolledBack: [{ id: "action-a", ok: true }] })).toContain("Net completed: 0. Rolled back: 1. Rollback failures: 0. Final state uncertain: 0.");
  });

  it("parses command metric URLs and applies the matching date bucket in Task Register", () => {
    const metric = parsePlannerMetricFilter("?metric=next-48");
    const actions = [
      { id: "overdue", project_id: "project-a", status: "Open", priority: "High", archived_at: null, due_date: "2026-08-01" },
      { id: "next", project_id: "project-a", status: "Open", priority: "High", archived_at: null, due_date: "2026-08-04" },
      { id: "later", project_id: "project-a", status: "Open", priority: "High", archived_at: null, due_date: "2026-08-05" },
    ];

    expect(metric).toBe("next-48");
    expect(filterActionsForMetric(actions, metric, "2026-08-02").map((action) => action.id)).toEqual(["next"]);
  });
});
