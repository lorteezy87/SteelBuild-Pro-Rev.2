import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { selectShiftedSyncTasks } from "../scheduleGanttDerive";

/**
 * Regression cover for audit §1.5 — "Set Baseline" and "Update Scheduled Dates"
 * ran over the PHASE-FILTERED row set.
 *
 * Both are project-wide writes. With a phase filter active, "Set baseline for
 * 60 tasks" baselined only the visible phase while its confirm dialog read like
 * it covered the job — a one-shot, overwrite-only field, silently written to a
 * subset.
 */

const GANTT_SRC = readFileSync(new URL("../ScheduleGantt.jsx", import.meta.url), "utf8");

const EFF = {
  "fab-1": { start: "2026-03-07", end: "2026-03-14", shifted: true, cycle: false },
  "fab-2": { start: "2026-04-01", end: "2026-04-05", shifted: false, cycle: false },
  "loop-1": { start: "2026-03-01", end: "2026-03-02", shifted: true, cycle: true },
  "tbd-1": { start: null, end: null, shifted: true, cycle: false },
  "sum-1": { start: "2026-03-01", end: "2026-05-01", shifted: true, cycle: false },
};

describe("selectShiftedSyncTasks", () => {
  it("selects a task the cascade actually moved", () => {
    expect(selectShiftedSyncTasks([{ id: "fab-1" }], EFF).map((t) => t.id)).toEqual(["fab-1"]);
  });

  it("skips a task the cascade did not move", () => {
    expect(selectShiftedSyncTasks([{ id: "fab-2" }], EFF)).toEqual([]);
  });

  it("skips cycle members — their effective dates fall back to stored", () => {
    expect(selectShiftedSyncTasks([{ id: "loop-1" }], EFF)).toEqual([]);
  });

  it("never invents a date on a TBD task", () => {
    expect(selectShiftedSyncTasks([{ id: "tbd-1" }], EFF)).toEqual([]);
  });

  it("skips summary rows — the DB rollup trigger owns their dates", () => {
    // Writing a summary's start_date directly is NOT reverted: the trigger
    // recomputes the row's PARENT, not the row itself, so a synced summary date
    // persists as a wrong value until some child happens to move.
    expect(selectShiftedSyncTasks([{ id: "sum-1", is_summary: true }], EFF)).toEqual([]);
    expect(selectShiftedSyncTasks([{ id: "sum-1", _hasChildren: true }], EFF)).toEqual([]);
    // ...but the same row with no summary marking is eligible, proving the
    // exclusion is the summary flag and not something else about the fixture.
    expect(selectShiftedSyncTasks([{ id: "sum-1" }], EFF).map((t) => t.id)).toEqual(["sum-1"]);
  });

  it("scope matters: filtering the input changes the write set", () => {
    // This is the defect, stated as an executable fact. Callers must pass the
    // whole project; handing it the visible rows silently does less than the
    // confirm dialog claims.
    const project = [{ id: "fab-1", phase: "Fabrication" }, { id: "det-9", phase: "Detailing" }];
    const effWithDet = { ...EFF, "det-9": { start: "2026-02-01", end: "2026-02-03", shifted: true, cycle: false } };

    const wholeProject = selectShiftedSyncTasks(project, effWithDet);
    const visibleOnly = selectShiftedSyncTasks(
      project.filter((t) => t.phase === "Fabrication"),
      effWithDet,
    );

    expect(wholeProject).toHaveLength(2);
    expect(visibleOnly).toHaveLength(1);
  });

  it("tolerates empty, null, and id-less input rather than throwing", () => {
    expect(selectShiftedSyncTasks([], EFF)).toEqual([]);
    expect(selectShiftedSyncTasks(null, EFF)).toEqual([]);
    expect(selectShiftedSyncTasks([{ id: "fab-1" }], null)).toEqual([]);
    expect(selectShiftedSyncTasks([{} as any, { id: "fab-1" }], EFF).map((t) => t.id)).toEqual(["fab-1"]);
  });
});

describe("wiring — the two project-wide writes do not read the filtered rows", () => {
  it("baseline is taken over projectTasks, not allTasks", () => {
    expect(GANTT_SRC).toMatch(/const tasksWithDates = projectTasks\.filter/);
    expect(GANTT_SRC).not.toMatch(/const tasksWithDates = allTasks\.filter/);
  });

  it("the sync set is taken over projectTasks", () => {
    expect(GANTT_SRC).toMatch(/selectShiftedSyncTasks\(projectTasks, effectiveDates\)/);
  });

  it("projectTasks is the unfiltered prop, not the rendered rows", () => {
    expect(GANTT_SRC).toMatch(/const projectTasks = rawTasks;/);
  });

  it("baselineTaskCount stays VIEW-scoped — it only describes what is rendered", () => {
    // Deliberately not project-scoped: it gates the baseline overlay toggle and
    // the legend, both of which describe the current view.
    expect(GANTT_SRC).toMatch(/baselineTaskCount = useMemo\(\s*\(\) => allTasks\.filter/);
  });

  it("both project-wide write buttons are guarded against a double-click", () => {
    // Each fires its whole write set concurrently; without this a double-click
    // doubles a project-wide write.
    const baselineBtn = GANTT_SRC.slice(GANTT_SRC.indexOf("onClick={handleSetBaseline}"));
    expect(baselineBtn.slice(0, 400)).toContain("disabled={saving}");
    const syncBtn = GANTT_SRC.slice(GANTT_SRC.indexOf("onClick={handleSyncScheduledDates}"));
    expect(syncBtn.slice(0, 400)).toContain("disabled={saving}");
    expect(GANTT_SRC).toContain("if (!onSave || saving) return;");
  });

  it("both confirm dialogs state the project-wide scope", () => {
    expect(GANTT_SRC).toContain("This covers the whole project, not just the phase you are viewing.");
  });
});
