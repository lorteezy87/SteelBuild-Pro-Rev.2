import { describe, it, expect } from "vitest";
import {
  resolveFieldPhase,
  canonicalFieldPhase,
  indexTasksById,
  FIELD_PHASES,
  FIELD_ACTIVITY_TYPES,
  PHASE_SOURCE,
} from "../fieldPhase";

const { PUNCHLIST, INSPECTION, SAFETY, DAILY_LOG } = FIELD_ACTIVITY_TYPES;

describe("canonicalFieldPhase", () => {
  it("folds the Installation alias onto Erection", () => {
    expect(canonicalFieldPhase("Installation")).toBe("Erection");
    expect(canonicalFieldPhase("Erection")).toBe("Erection");
  });
  it("passes other phases through and maps empty to null", () => {
    expect(canonicalFieldPhase("Fabrication")).toBe("Fabrication");
    expect(canonicalFieldPhase(null)).toBeNull();
    expect(canonicalFieldPhase("")).toBeNull();
  });
});

describe("FIELD_PHASES", () => {
  it("offers each lifecycle phase exactly once, without the Installation alias", () => {
    expect(FIELD_PHASES).toEqual([
      "Pre-Construction",
      "Detailing",
      "Procurement",
      "Fabrication",
      "Delivery",
      "Erection",
      "Closeout",
    ]);
  });
});

describe("resolveFieldPhase — stored phase wins", () => {
  it("uses the record's own phase column when present", () => {
    const r = resolveFieldPhase({ phase: "Fabrication", description: "erect beams" }, PUNCHLIST);
    expect(r).toEqual({ phase: "Fabrication", source: PHASE_SOURCE.STORED });
  });

  it("canonicalizes a stored Installation to Erection", () => {
    expect(resolveFieldPhase({ phase: "Installation" }, PUNCHLIST).phase).toBe("Erection");
  });

  it("beats a linked schedule task", () => {
    const tasksById = indexTasksById([{ id: "t1", phase: "Detailing" }]);
    const log = { phase: "Closeout", schedule_task_ids: ["t1"], activities: "weld" };
    expect(resolveFieldPhase(log, DAILY_LOG, { tasksById })).toEqual({
      phase: "Closeout",
      source: PHASE_SOURCE.STORED,
    });
  });
});

describe("resolveFieldPhase — daily logs link to real schedule tasks", () => {
  const tasksById = indexTasksById([
    { id: "t1", phase: "Fabrication" },
    { id: "t2", phase: "Installation" },
    { id: "t3", phase: "Detailing" },
    { id: "t4" }, // task with no phase
  ]);

  it("uses the linked task's phase", () => {
    const r = resolveFieldPhase({ schedule_task_ids: ["t1"] }, DAILY_LOG, { tasksById });
    expect(r).toEqual({ phase: "Fabrication", source: PHASE_SOURCE.LINKED });
  });

  it("reports the earliest phase when a log spans several", () => {
    const r = resolveFieldPhase({ schedule_task_ids: ["t2", "t1", "t3"] }, DAILY_LOG, { tasksById });
    expect(r).toEqual({ phase: "Detailing", source: PHASE_SOURCE.LINKED });
  });

  it("canonicalizes a linked Installation to Erection", () => {
    const r = resolveFieldPhase({ schedule_task_ids: ["t2"] }, DAILY_LOG, { tasksById });
    expect(r.phase).toBe("Erection");
  });

  it("falls through to derivation when links resolve to nothing", () => {
    const r = resolveFieldPhase(
      { schedule_task_ids: ["t4", "missing"], activities: "shop welding" },
      DAILY_LOG,
      { tasksById },
    );
    expect(r).toEqual({ phase: "Fabrication", source: PHASE_SOURCE.DERIVED });
  });

  it("falls through when there are no links at all", () => {
    const r = resolveFieldPhase({ activities: "erecting columns" }, DAILY_LOG, { tasksById });
    expect(r).toEqual({ phase: "Erection", source: PHASE_SOURCE.DERIVED });
  });

  it("does not consult links for non-daily-log types", () => {
    const r = resolveFieldPhase({ schedule_task_ids: ["t1"], description: "touch-up paint" }, PUNCHLIST, { tasksById });
    expect(r.source).toBe(PHASE_SOURCE.DERIVED);
  });
});

describe("resolveFieldPhase — derivation reads each register's own text column", () => {
  it("punchlist reads description, then category", () => {
    expect(resolveFieldPhase({ description: "regalvanize handrail" }, PUNCHLIST).phase).toBe("Fabrication");
    expect(resolveFieldPhase({ category: "final walkthrough" }, PUNCHLIST).phase).toBe("Closeout");
  });

  it("inspection reads inspection_type", () => {
    expect(resolveFieldPhase({ inspection_type: "Shop Weld" }, INSPECTION).phase).toBe("Fabrication");
    expect(resolveFieldPhase({ inspection_type: "Field Bolt-Up" }, INSPECTION).phase).toBe("Erection");
    expect(resolveFieldPhase({ inspection_type: "Final Punch" }, INSPECTION).phase).toBe("Closeout");
  });

  it("safety reads incident_type, then description", () => {
    expect(resolveFieldPhase({ incident_type: "Crane tip-over" }, SAFETY).phase).toBe("Erection");
    expect(resolveFieldPhase({ description: "Cut hand in the shop" }, SAFETY).phase).toBe("Fabrication");
  });

  it("marks every inferred phase as derived, never as fact", () => {
    expect(resolveFieldPhase({ description: "erect beams" }, PUNCHLIST).source).toBe(PHASE_SOURCE.DERIVED);
  });
});

describe("resolveFieldPhase — no text means no guess", () => {
  // derivePhase defaults unclassifiable text to "Pre-Construction"; on a blank
  // record that would render as a confident-looking lie.
  it("returns a null phase for a record with no usable text", () => {
    expect(resolveFieldPhase({}, PUNCHLIST)).toEqual({ phase: null, source: PHASE_SOURCE.DERIVED });
    expect(resolveFieldPhase({ description: "   " }, SAFETY).phase).toBeNull();
    expect(resolveFieldPhase(null, INSPECTION).phase).toBeNull();
  });

  it("still guesses Pre-Construction when the text actually says so", () => {
    expect(resolveFieldPhase({ description: "permit walk" }, PUNCHLIST).phase).toBe("Pre-Construction");
  });
});

describe("indexTasksById", () => {
  it("indexes by id and skips rows without one", () => {
    const m = indexTasksById([{ id: "a", phase: "Detailing" }, { phase: "Closeout" }, null]);
    expect(m.size).toBe(1);
    expect(m.get("a").phase).toBe("Detailing");
  });
  it("tolerates a missing list", () => {
    expect(indexTasksById(undefined).size).toBe(0);
  });
});
