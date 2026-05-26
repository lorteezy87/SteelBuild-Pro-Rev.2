import { describe, expect, it } from "vitest";
import {
  evaluateTaskGate,
  buildGateMap,
  blockingConstraintPriority,
  summarizeBlockingConstraints,
} from "../scheduleGatekeeper";
import { deriveOperationalConstraints } from "../constraintEngine";
import { applyEffectiveDatesWithGates, applyScheduleGates } from "../scheduleCascade";

// A generated-style RFI constraint, scoped to a work package, as the
// constraintEngine emits it. Override fields per test.
function rfiConstraint(overrides: Record<string, any> = {}) {
  return {
    id: "c-1",
    status: "Open",
    priority: "Critical",
    constraint_type: "Engineering Hold",
    title: "Engineering Hold: RFI 814 - Landing support",
    work_package_id: "wp-1",
    assigned_to: "EOR",
    due_date: "2026-01-01",
    _generated: true,
    _source_type: "RFI",
    _source_id: "rfi-814",
    _source_ref: "RFI 814",
    metadata: { constraint_engine: { generated: true, source_type: "RFI", source_id: "rfi-814", source_ref: "RFI 814" } },
    ...overrides,
  };
}

const TODAY = "2026-05-26";

describe("scheduleGatekeeper — blockingConstraintPriority", () => {
  it("recognises an unresolved Critical RFI constraint", () => {
    expect(blockingConstraintPriority(rfiConstraint({ priority: "Critical" }))).toBe("Critical");
  });
  it("recognises an unresolved High RFI constraint", () => {
    expect(blockingConstraintPriority(rfiConstraint({ priority: "High" }))).toBe("High");
  });
  it("ignores Medium/Low priority", () => {
    expect(blockingConstraintPriority(rfiConstraint({ priority: "Medium" }))).toBeNull();
    expect(blockingConstraintPriority(rfiConstraint({ priority: "Low" }))).toBeNull();
  });
  it("ignores resolved/closed constraints", () => {
    expect(blockingConstraintPriority(rfiConstraint({ status: "Closed" }))).toBeNull();
    expect(blockingConstraintPriority(rfiConstraint({ status: "resolved" }))).toBeNull();
  });
  it("ignores non-RFI constraint sources", () => {
    const delivery = rfiConstraint({
      constraint_type: "Procurement Hold",
      _source_type: "Delivery",
      metadata: { constraint_engine: { source_type: "Delivery" } },
    });
    expect(blockingConstraintPriority(delivery)).toBeNull();
  });
});

describe("scheduleGatekeeper — evaluateTaskGate", () => {
  const task = { id: "t1", work_package_id: "wp-1", phase: "Fabrication" };

  it("BLOCKS a fabrication task whose work package has a Critical RFI hold", () => {
    const gate = evaluateTaskGate(task, [rfiConstraint({ priority: "Critical" })], { today: TODAY });
    expect(gate.state).toBe("blocked");
    expect(gate.canSchedule).toBe(false);
    expect(gate.blockers).toHaveLength(1);
    expect(gate.warnings).toHaveLength(0);
    expect(gate.blockers[0]).toMatchObject({
      priority: "Critical",
      sourceRef: "RFI 814",
      rfiNumber: "814",
      ballInCourt: "EOR",
      workPackageId: "wp-1",
    });
  });

  it("WARNS (but allows) when the hold is only High priority", () => {
    const gate = evaluateTaskGate(task, [rfiConstraint({ priority: "High" })], { today: TODAY });
    expect(gate.state).toBe("warning");
    expect(gate.canSchedule).toBe(true);
    expect(gate.warnings).toHaveLength(1);
    expect(gate.blockers).toHaveLength(0);
  });

  it("is CLEAR when the constraint is on a different work package", () => {
    const gate = evaluateTaskGate(task, [rfiConstraint({ work_package_id: "wp-OTHER" })], { today: TODAY });
    expect(gate.state).toBe("clear");
    expect(gate.canSchedule).toBe(true);
  });

  it("is CLEAR when the only constraint is resolved", () => {
    const gate = evaluateTaskGate(task, [rfiConstraint({ status: "Closed" })], { today: TODAY });
    expect(gate.state).toBe("clear");
  });

  it("does NOT gate a detailing task by default (production phases only)", () => {
    const detailing = { id: "t2", work_package_id: "wp-1", phase: "Detailing" };
    const gate = evaluateTaskGate(detailing, [rfiConstraint()], { today: TODAY });
    expect(gate.state).toBe("clear");
  });

  it("gates any phase when productionPhasesOnly is disabled", () => {
    const detailing = { id: "t2", work_package_id: "wp-1", phase: "Detailing" };
    const gate = evaluateTaskGate(detailing, [rfiConstraint()], { today: TODAY, productionPhasesOnly: false });
    expect(gate.state).toBe("blocked");
  });

  it("marks a blocker overdue when the RFI due date has passed", () => {
    const overdue = evaluateTaskGate(task, [rfiConstraint({ due_date: "2026-01-01" })], { today: TODAY });
    expect(overdue.blockers[0].overdue).toBe(true);
    const future = evaluateTaskGate(task, [rfiConstraint({ due_date: "2026-12-31" })], { today: TODAY });
    expect(future.blockers[0].overdue).toBe(false);
  });

  it("enriches blocker fields from rfisById when provided", () => {
    const rfisById = {
      "rfi-814": { rfi_number: "814", title: "Landing support detail", ball_in_court: "AOR", due_date: "2026-02-15" },
    };
    const gate = evaluateTaskGate(task, [rfiConstraint()], { today: TODAY, rfisById });
    expect(gate.blockers[0]).toMatchObject({
      rfiNumber: "814",
      title: "Landing support detail",
      ballInCourt: "AOR",
      dueDate: "2026-02-15",
    });
  });

  it("falls back to area matching when the constraint has no work package", () => {
    const areaConstraint = rfiConstraint({ work_package_id: null, project_area: "Hangar 1" });
    const areaTask = { id: "t3", phase: "Erection", area: "Hangar 1" };
    const gate = evaluateTaskGate(areaTask, [areaConstraint], { today: TODAY });
    expect(gate.state).toBe("blocked");

    const otherArea = { id: "t4", phase: "Erection", area: "Hangar 2" };
    expect(evaluateTaskGate(otherArea, [areaConstraint], { today: TODAY }).state).toBe("clear");
  });

  it("Critical outranks High when both apply to the task", () => {
    const gate = evaluateTaskGate(
      task,
      [rfiConstraint({ id: "c-hi", priority: "High", _source_ref: "RFI 700" }), rfiConstraint({ id: "c-cr", priority: "Critical" })],
      { today: TODAY },
    );
    expect(gate.state).toBe("blocked");
    expect(gate.blockers).toHaveLength(1);
    expect(gate.warnings).toHaveLength(1);
  });
});

describe("scheduleGatekeeper — buildGateMap & summarizeBlockingConstraints", () => {
  it("keys gates by task id", () => {
    const tasks = [
      { id: "t1", work_package_id: "wp-1", phase: "Fabrication" },
      { id: "t2", work_package_id: "wp-2", phase: "Erection" },
    ];
    const map = buildGateMap(tasks, [rfiConstraint({ work_package_id: "wp-1" })], { today: TODAY });
    expect(map.t1.state).toBe("blocked");
    expect(map.t2.state).toBe("clear");
  });

  it("rolls up project-wide blocking constraints regardless of task linkage", () => {
    const summary = summarizeBlockingConstraints(
      [rfiConstraint({ priority: "Critical" }), rfiConstraint({ id: "c-2", priority: "High", _source_ref: "RFI 890", _source_id: "rfi-890" })],
      { today: TODAY },
    );
    expect(summary.state).toBe("blocked");
    expect(summary.blockers).toHaveLength(1);
    expect(summary.warnings).toHaveLength(1);
  });
});

describe("scheduleGatekeeper — end-to-end with constraintEngine + scheduleCascade", () => {
  it("derives a Critical hold from an open RFI and blocks the linked fabrication task", () => {
    const rfis = [
      {
        id: "rfi-814",
        project_id: "p1",
        rfi_number: "814",
        title: "Landing support connection",
        status: "Open",
        priority: "Critical",
        work_package_id: "wp-5",
        ball_in_court: "EOR",
        due_date: "2026-06-30",
      },
    ];
    const constraints = deriveOperationalConstraints({ rfis }, { today: TODAY });
    expect(constraints).toHaveLength(1);
    expect(constraints[0].work_package_id).toBe("wp-5");

    const tasks = [
      { id: "fab-1", work_package_id: "wp-5", phase: "Fabrication", start_date: "2026-06-01", end_date: "2026-06-05" },
      { id: "fab-2", work_package_id: "wp-9", phase: "Fabrication", start_date: "2026-06-01", end_date: "2026-06-05" },
    ];
    const gated = applyEffectiveDatesWithGates(tasks, constraints, { today: TODAY, rfisById: { "rfi-814": rfis[0] } });
    const blocked = gated.find((t) => t.id === "fab-1");
    const clear = gated.find((t) => t.id === "fab-2");
    expect(blocked?._gate.state).toBe("blocked");
    expect(blocked?._gate.blockers[0].rfiNumber).toBe("814");
    expect(blocked?._gate.blockers[0].ballInCourt).toBe("EOR");
    expect(clear?._gate.state).toBe("clear");
    // effective dates still present (cascade ran)
    expect(blocked?.start_date).toBe("2026-06-01");
  });

  it("applyScheduleGates leaves tasks without an id untouched", () => {
    const result = applyScheduleGates([{ work_package_id: "wp-1", phase: "Fabrication" } as any], [rfiConstraint()], { today: TODAY });
    expect(result[0]._gate).toBeUndefined();
  });
});
