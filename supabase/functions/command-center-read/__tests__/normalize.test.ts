import { describe, expect, it } from "vitest";

import { normalizeSourceRow } from "../normalize";

const baseUrl = "https://steelbuild-pro.vercel.app";
const project = { id: "project-1", number: "P-001", name: "Airport Expansion" };
const common = { id: "record-1", project_id: project.id, updated_at: "2026-07-21T20:00:00.000Z" };

describe("command-center row normalization", () => {
  it.each([
    ["project", {
      id: project.id,
      name: project.name,
      project_number: project.number,
      phase: "Fabrication",
      health_status: "Critical",
      on_hold: true,
      on_hold_reason: "Owner direction",
      project_manager: "Pat PM",
      target_completion_date: "2026-08-15",
      updated_at: common.updated_at,
    }],
    ["rfi", {
      ...common,
      rfi_number: "RFI-42",
      title: "Connection detail",
      status: "Open",
      priority: "Critical",
      assigned_to: "Pat PM",
      ball_in_court: "Engineer",
      date_required: "2026-07-22",
      schedule_impact: true,
      schedule_impact_days: 4,
    }],
    ["change_order", {
      ...common,
      co_number: "CO-18",
      title: "East elevation change",
      status: "Submitted",
      co_amount: 125000,
      schedule_impact_days: 12,
    }],
    ["drawing_revision", {
      ...common,
      drawing_id: "drawing-1",
      sheet_number: "S1.1",
      sheet_title: "Foundation plan",
      revision_code: "B",
      release_status: "Released for Fabrication",
      is_current: true,
      issued_at: "2026-07-20",
    }],
    ["schedule_task", {
      ...common,
      task_name: "Set Level 2 steel",
      status: "Blocked",
      assigned_to: "Field superintendent",
      start_date: "2026-07-20",
      end_date: "2026-07-22",
      priority: "Critical",
      blockers: ["Crane access blocked"],
    }],
    ["submittal", {
      ...common,
      submittal_number: "S-205",
      revision: "2",
      title: "Stair steel",
      status: "Under Review",
      reviewer: "Architect",
      ball_in_court: "Architect",
      required_date: "2026-07-23",
      days_in_review: 8,
    }],
  ] as const)("normalizes the allowlisted %s fields", (entityType, row) => {
    const normalized = normalizeSourceRow({ entityType, row, project, baseUrl });
    expect(normalized.entityType).toBe(entityType);
    expect(normalized.project).toEqual(project);
    expect(normalized.sourceUrl).toMatch(/^https:\/\/steelbuild-pro\.vercel\.app\//);
    expect(normalized.source.sourceUrl).toBe(normalized.sourceUrl);
    expect(normalized.updatedAt).toBe(common.updated_at);
  });

  it("does not copy unrestricted notes or descriptions", () => {
    const normalized = normalizeSourceRow({
      entityType: "rfi",
      row: {
        ...common,
        rfi_number: "RFI-42",
        title: "Connection detail",
        status: "Open",
        priority: "Normal",
        notes: "private-note-secret",
        internal_notes: "internal-note-secret",
        description: "unrestricted-description-secret",
      },
      project,
      baseUrl,
    });
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain("private-note-secret");
    expect(serialized).not.toContain("internal-note-secret");
    expect(serialized).not.toContain("unrestricted-description-secret");
  });
});
