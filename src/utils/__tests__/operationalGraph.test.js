import { describe, expect, it } from "vitest";
import { buildOperationalGraphHealth } from "../operationalGraph";

describe("buildOperationalGraphHealth", () => {
  it("flags S&H source-of-truth and linkage gaps", () => {
    const health = buildOperationalGraphHealth({
      drawingSets: [
        { id: "set-1", set_name: "WESTCORE-CONN-S2-R3", project_id: "p1", revision: "", discipline: "" },
      ],
      submittals: [
        {
          id: "sub-1",
          submittal_number: "S-042",
          title: "Connections Rev 1",
          status: "Submitted",
          file_url: "https://example.com/submittal.pdf",
          drawing_set_ids: [],
        },
      ],
      rfis: [
        {
          id: "rfi-1",
          rfi_number: "118",
          title: "Clarify HSS header",
          status: "Open",
          priority: "High",
        },
      ],
      workPackages: [
        {
          id: "wp-1",
          wp_number: "WP-WC-S2-COLUMNS",
          name: "West Core Columns",
          status: "In Progress",
          phase: "Fabrication",
          linked_drawing_ids: "",
          sequence_confirmed: false,
        },
      ],
      deliveries: [
        { id: "del-1", delivery_id: "TRK-S2-WC-0516", status: "Scheduled", scheduled_date: "2026-05-16" },
      ],
      dailyLogs: [
        { id: "log-1", date: "2026-05-16", status: "Submitted", headcount: 4, hours_worked: 32, activities: "Set columns" },
      ],
    });

    expect(health.gapCount).toBeGreaterThan(0);
    expect(health.highImpactCount).toBeGreaterThan(0);
    expect(health.duplicateRiskCount).toBeGreaterThan(0);
    expect(health.gaps.map((gap) => gap.id)).toEqual(
      expect.arrayContaining([
        "submittal:sub-1:no-drawing-set",
        "rfi:rfi-1:no-work-package",
        "delivery:del-1:no-work-package",
        "work-package:wp-1:no-drawings",
        "daily-log:log-1:no-work-link",
      ])
    );
    expect(health.countsByOwner["RFI Hub"]).toBeGreaterThan(0);
    expect(health.score).toBeLessThan(100);
  });

  it("treats linked production data as a healthy graph", () => {
    const health = buildOperationalGraphHealth({
      drawingSets: [
        {
          id: "set-1",
          set_name: "WESTCORE-CONN-S2-R3",
          current_submittal_id: "sub-1",
          revision: "3",
          discipline: "Structural",
          metadata: { area: "West Core", sequence: "S2" },
        },
      ],
      drawings: [
        { id: "dwg-1", drawing_set_id: "set-1", sheet_number: "S3.1" },
      ],
      submittals: [
        {
          id: "sub-1",
          submittal_number: "S-042",
          title: "Connections Rev 3",
          status: "Submitted",
          drawing_set_ids: ["set-1"],
          ball_in_court: "EOR",
          required_date: "2026-05-20",
        },
      ],
      rfis: [
        {
          id: "rfi-1",
          rfi_number: "118",
          title: "Clarify HSS header",
          status: "Open",
          work_package_id: "wp-1",
          drawing_reference: "S3.1",
          ball_in_court: "EOR",
          due_date: "2026-05-19",
        },
      ],
      workPackages: [
        {
          id: "wp-1",
          wp_number: "WP-WC-S2-COLUMNS",
          name: "West Core Columns",
          status: "In Progress",
          phase: "Fabrication",
          linked_drawing_ids: "dwg-1",
          sequence_confirmed: true,
          metadata: { area: "West Core", sequence: "S2" },
        },
      ],
      deliveries: [
        {
          id: "del-1",
          delivery_id: "TRK-S2-WC-0516",
          status: "Scheduled",
          scheduled_date: "2026-05-16",
          work_package_id: "wp-1",
        },
      ],
      dailyLogs: [
        {
          id: "log-1",
          date: "2026-05-16",
          status: "Submitted",
          headcount: 4,
          hours_worked: 32,
          activities: "Set columns",
          wp_progress: [{ wp_id: "wp-1", percent_complete: 20 }],
        },
      ],
      scheduleTasks: [
        {
          id: "task-1",
          task_name: "Install West Core Columns",
          status: "In Progress",
          phase: "Erection",
          metadata: { work_package_id: "wp-1" },
        },
      ],
    });

    expect(health.gapCount).toBe(0);
    expect(health.score).toBe(100);
    expect(health.recordsReviewed).toBe(7);
  });

  it("orders high-impact gaps before lower-priority cleanup", () => {
    const health = buildOperationalGraphHealth({
      drawingSets: [
        { id: "set-1", set_name: "Set 1", current_submittal_id: "sub-1", revision: "1" },
      ],
      submittals: [
        { id: "sub-1", submittal_number: "S-001", status: "Submitted", drawing_set_ids: ["set-1"], required_date: "2026-05-20" },
      ],
      deliveries: [
        { id: "del-1", delivery_id: "TRK-1", status: "Scheduled" },
      ],
    });

    expect(health.gaps[0]).toMatchObject({
      id: "delivery:del-1:no-work-package",
      severity: "High",
    });
    expect(health.topGaps.length).toBeLessThanOrEqual(8);
  });
});
