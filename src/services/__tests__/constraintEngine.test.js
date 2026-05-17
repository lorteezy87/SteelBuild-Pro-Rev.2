import { describe, expect, it } from "vitest";
import { deriveOperationalConstraints, isGeneratedConstraint } from "../constraintEngine";

describe("constraint engine", () => {
  it("turns open RFIs into engineering holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        rfis: [
          {
            id: "rfi-1",
            project_id: "project-1",
            rfi_number: "058",
            title: "Canopy column conflict",
            status: "Open",
            priority: "High",
            due_date: "2026-05-15",
          },
          {
            id: "rfi-2",
            project_id: "project-1",
            rfi_number: "059",
            title: "Answered item",
            status: "Answered",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      id: "generated:rfi:rfi-1",
      constraint_type: "Engineering Hold",
      priority: "High",
      work_package_id: null,
      _source_type: "RFI",
      _source_ref: "RFI 058",
    });
    expect(isGeneratedConstraint(constraints[0])).toBe(true);
  });

  it("turns revise-and-resubmit submittals into approval holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        submittals: [
          {
            id: "sub-1",
            project_id: "project-1",
            submittal_number: "SUB-004",
            title: "Anchor bolt embed package",
            status: "Revise and Resubmit",
            required_date: "2026-05-20",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraint_type: "Approval Hold",
      priority: "High",
      due_date: "2026-05-20",
      _source_type: "Submittal",
    });
  });

  it("turns late deliveries into procurement holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        deliveries: [
          {
            id: "delivery-1",
            project_id: "project-1",
            delivery_title: "Roof joist material",
            status: "Scheduled",
            required_date: "2026-05-12",
            work_package_id: "wp-1",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraint_type: "Procurement Hold",
      priority: "High",
      work_package_id: "wp-1",
      _source_type: "Delivery",
    });
  });

  it("turns failed or deficient inspections into quality holds", () => {
    const constraints = deriveOperationalConstraints({
      inspections: [
        {
          id: "inspection-1",
          project_id: "project-1",
          inspection_type: "Weld inspection",
          status: "Completed",
          sign_off_status: "Rejected",
          deficiencies_count: 2,
          inspection_date: "2026-05-14",
        },
      ],
    });

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraint_type: "Quality Hold",
      priority: "High",
      _source_type: "Inspection",
    });
  });

  it("turns late incomplete schedule tasks into schedule holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        scheduleTasks: [
          {
            id: "task-1",
            project_id: "project-1",
            task_name: "Detailing",
            status: "Not Started",
            percent_complete: 0,
            end_date: "2026-05-06",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraint_type: "Schedule Hold",
      priority: "High",
      _source_type: "Schedule Task",
    });
  });

  it("turns upcoming unassigned schedule tasks into resource holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        scheduleTasks: [
          {
            id: "task-2",
            project_id: "project-1",
            task_name: "Set steel sequence 2",
            status: "Not Started",
            percent_complete: 0,
            start_date: "2026-05-18",
            resource_names: [],
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraint_type: "Resource Hold",
      priority: "Medium",
      _source_type: "Schedule Task",
    });
  });

  it("turns production package gaps into resource, release, and IFC holds", () => {
    const constraints = deriveOperationalConstraints(
      {
        workPackages: [
          {
            id: "wp-1",
            project_id: "project-1",
            wp_number: "WP-204",
            name: "Roof East sequence",
            phase: "Fabrication",
            status: "In Progress",
            percent_complete: 25,
            linked_drawing_ids: "drawing-1",
            scheduled_start_date: "2026-05-18",
          },
        ],
        drawings: [
          {
            id: "drawing-1",
            stage: "OFA",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints.map((constraint) => constraint.constraint_type).sort()).toEqual([
      "IFC Hold",
      "Production Hold",
      "Resource Hold",
    ].sort());
    expect(constraints.every((constraint) => constraint.work_package_id === "wp-1")).toBe(true);
  });

  it("suppresses generated rows when an open persisted constraint already has the source key", () => {
    const constraints = deriveOperationalConstraints(
      {
        existingConstraints: [
          {
            id: "constraint-1",
            status: "Open",
            metadata: {
              constraint_engine: {
                key: "rfi:rfi-1",
                source_type: "RFI",
                source_id: "rfi-1",
              },
            },
          },
        ],
        rfis: [
          {
            id: "rfi-1",
            project_id: "project-1",
            rfi_number: "058",
            title: "Canopy column conflict",
            status: "Open",
          },
        ],
      },
      { today: "2026-05-16" },
    );

    expect(constraints).toEqual([]);
  });
});
