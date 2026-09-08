import { describe, it, expect } from "vitest";
import {
  buildBaselineRows,
  resolveTaskBaseline,
  storedStart,
  storedFinish,
} from "../scheduleBaselines";
import type { BaselineRow } from "../scheduleBaselines";

/**
 * Cover for audit §1.5 / §7.2 — baseline was three keys on metadata, snapshot
 * from the CASCADED dates, written under a phase filter, overwrite-only.
 *
 * The single most important assertion in this file is that the snapshot takes
 * STORED dates. A baseline built from effective dates bakes whatever position
 * the predecessors happened to be in that afternoon into the contract schedule,
 * and it is the number you would end up defending in a delay claim.
 */

describe("stored vs effective dates", () => {
  it("reads through the effective-date overlay to the entered dates", () => {
    // This is the shape applyEffectiveDates produces: start_date is overwritten
    // with the cascaded value and the entered one is preserved under _stored_*.
    const cascaded = {
      id: "fab",
      start_date: "2026-03-15", // where the Gantt DRAWS it
      end_date: "2026-03-20",
      _stored_start_date: "2026-03-10", // what someone actually entered
      _stored_end_date: "2026-03-15",
    };
    expect(storedStart(cascaded)).toBe("2026-03-10");
    expect(storedFinish(cascaded)).toBe("2026-03-15");

    const [row] = buildBaselineRows([cascaded]);
    expect(row.baseline_start).toBe("2026-03-10");
    expect(row.baseline_finish).toBe("2026-03-15");
  });

  it("falls back to start_date when there is no overlay", () => {
    const plain = { id: "a", start_date: "2026-04-01", end_date: "2026-04-05" };
    expect(storedStart(plain)).toBe("2026-04-01");
    const [row] = buildBaselineRows([plain]);
    expect(row.baseline_start).toBe("2026-04-01");
  });
});

describe("buildBaselineRows", () => {
  it("skips tasks with no dates rather than writing a row of nulls", () => {
    // A row recording nothing is indistinguishable from a task that was never
    // baselined, and it inflates task_count into a coverage number that lies.
    const rows = buildBaselineRows([
      { id: "dated", start_date: "2026-04-01" },
      { id: "tbd", start_date: null, end_date: null },
    ]);
    expect(rows.map((r) => r.task_id)).toEqual(["dated"]);
  });

  it("keeps a task with only one of the two dates", () => {
    const rows = buildBaselineRows([{ id: "open-ended", start_date: "2026-04-01", end_date: null }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].baseline_finish).toBeNull();
  });

  it("drops an inverted finish instead of losing the whole snapshot", () => {
    // Two rows with end_date < start_date exist in production (pre-validator
    // legacy). Either would trip the CHECK constraint and abort the batch.
    const [row] = buildBaselineRows([{ id: "legacy", start_date: "2026-05-10", end_date: "2026-05-01" }]);
    expect(row.baseline_start).toBe("2026-05-10");
    expect(row.baseline_finish).toBeNull();
  });

  it("flags summary rows rather than omitting them", () => {
    // Their dates are derived, but a baseline with no parents cannot answer
    // "what was this phase supposed to span".
    const rows = buildBaselineRows([
      { id: "sum", start_date: "2026-03-01", end_date: "2026-05-01", is_summary: true },
      { id: "sum2", start_date: "2026-03-01", end_date: "2026-05-01", _hasChildren: true },
      { id: "leaf", start_date: "2026-03-01", end_date: "2026-03-05" },
    ]);
    expect(rows.find((r) => r.task_id === "sum")!.is_summary).toBe(true);
    expect(rows.find((r) => r.task_id === "sum2")!.is_summary).toBe(true);
    expect(rows.find((r) => r.task_id === "leaf")!.is_summary).toBe(false);
  });

  it("coerces a non-numeric duration to null instead of NaN", () => {
    const rows = buildBaselineRows([
      { id: "a", start_date: "2026-04-01", duration: "5" },
      { id: "b", start_date: "2026-04-01", duration: "" },
      { id: "c", start_date: "2026-04-01", duration: null },
    ]);
    expect(rows.map((r) => r.baseline_duration)).toEqual([5, null, null]);
  });

  it("scope matters: it snapshots exactly the list it is handed", () => {
    // §1.5's actual defect. Callers must pass the whole project; handing it the
    // visible rows baselines one phase while the dialog counts the whole job.
    const project = [
      { id: "a", phase: "Fabrication", start_date: "2026-04-01" },
      { id: "b", phase: "Erection", start_date: "2026-05-01" },
    ];
    expect(buildBaselineRows(project)).toHaveLength(2);
    expect(buildBaselineRows(project.filter((t) => t.phase === "Fabrication"))).toHaveLength(1);
  });

  it("tolerates empty, null, and id-less input", () => {
    expect(buildBaselineRows([])).toEqual([]);
    expect(buildBaselineRows(null)).toEqual([]);
    expect(buildBaselineRows([{ start_date: "2026-04-01" }])).toEqual([]);
  });
});

describe("resolveTaskBaseline", () => {
  const tableRow: BaselineRow = {
    task_id: "a", wbs_code: "1.1", task_name: "Detail", phase: "Detailing",
    baseline_start: "2026-03-01", baseline_finish: "2026-03-10",
    baseline_duration: 9, is_summary: false,
  };

  it("prefers the table over metadata", () => {
    const task = { id: "a", metadata: { baseline_start: "2026-01-01", baseline_end: "2026-01-05" } };
    const resolved = resolveTaskBaseline(task, { a: tableRow })!;
    expect(resolved.source).toBe("table");
    expect(resolved.start).toBe("2026-03-01");
  });

  it("falls back to metadata so baselines do not vanish before the migration runs", () => {
    // Migrations here are pushed by hand, so a deploy can land first. Reading
    // the table only would blank every existing baseline in that window.
    const task = { id: "a", metadata: { baseline_start: "2026-01-01", baseline_end: "2026-01-05" } };
    const resolved = resolveTaskBaseline(task, {})!;
    expect(resolved.source).toBe("metadata");
    expect(resolved.start).toBe("2026-01-01");
  });

  it("parses metadata stored as a JSON string", () => {
    const task = { id: "a", metadata: JSON.stringify({ baseline_start: "2026-02-02" }) };
    expect(resolveTaskBaseline(task, {})!.start).toBe("2026-02-02");
  });

  it("returns null when neither source has anything", () => {
    expect(resolveTaskBaseline({ id: "a" }, {})).toBeNull();
    expect(resolveTaskBaseline({ id: "a", metadata: {} }, {})).toBeNull();
    expect(resolveTaskBaseline({ id: "a", metadata: "{not json" }, {})).toBeNull();
    expect(resolveTaskBaseline({ id: "a" }, null)).toBeNull();
  });

  it("ignores a table row that carries no dates", () => {
    // An all-null snapshot row must not mask a usable metadata baseline.
    const empty: BaselineRow = { ...tableRow, baseline_start: null, baseline_finish: null };
    const task = { id: "a", metadata: { baseline_start: "2026-01-01" } };
    expect(resolveTaskBaseline(task, { a: empty })!.source).toBe("metadata");
  });
});
