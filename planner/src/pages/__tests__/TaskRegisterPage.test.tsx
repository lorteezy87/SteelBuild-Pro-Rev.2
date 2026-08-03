// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildActionsCsv, plannerActionsQueryKey } from "../../features/actions/exportActionsCsv";

describe("TaskRegisterPage support", () => {
  it("exports only stable register columns with CSV escaping", () => {
    const csv = buildActionsCsv([{
      id: "action-1", project_id: "project-1", project_name: "A, Project", title: "Confirm \"embed\"\nlayout", priority: "High", status: "Open", archived_at: null,
      workstream: "Detailing", action_date: "2026-08-02", follow_up_date: null, due_date: "2026-08-03", impact_date: null, waiting_on: null,
    }]);

    expect(csv).toContain("Priority,Project,Action,Workstream,Action Date,Follow-Up,Required,Impact,Waiting On,Status");
    expect(csv).toContain('"A, Project"');
    expect(csv).toContain('"Confirm ""embed""\nlayout"');
    expect(csv).not.toContain("project_id");
  });

  it("uses a distinct action-query boundary when the active organization changes", () => {
    const filters = { search: "shop" };
    expect(plannerActionsQueryKey("org-a", filters)).not.toEqual(plannerActionsQueryKey("org-b", filters));
  });

  it("neutralizes spreadsheet formula prefixes even after leading whitespace", () => {
    const csv = buildActionsCsv([{
      id: "action-2", project_id: "project-1", project_name: "\t=HYPERLINK(\"https://unsafe\")", title: "  +SUM(A1:A2)", priority: "High", status: "Open", archived_at: null,
      workstream: "-10", action_date: "2026-08-02", follow_up_date: null, due_date: "2026-08-03", impact_date: null, waiting_on: "\r@cmd",
    }]);

    expect(csv).toContain("'\t=HYPERLINK");
    expect(csv).toContain("'  +SUM(A1:A2)");
    expect(csv).toContain("'-10");
    expect(csv).toContain("'\r@cmd");
  });

  it("exports raw whitespace and null values rather than display placeholders", () => {
    const csv = buildActionsCsv([{
      id: "action-3", project_id: "project-1", project_name: "  Project  ", title: "  Keep spacing  ", priority: null, status: "Open", archived_at: null,
      workstream: null, action_date: null, follow_up_date: null, due_date: null, impact_date: null, waiting_on: null,
    }]);

    expect(csv).toContain(',  Project  ,  Keep spacing  ,,,,,,,Open');
    expect(csv).not.toContain("—");
  });
});
