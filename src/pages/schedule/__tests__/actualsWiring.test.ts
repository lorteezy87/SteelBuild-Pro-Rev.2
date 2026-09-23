import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";
import { assertScheduleDateRange } from "../scheduleDateValidation";

/**
 * Wiring cover for audit §1.4 / §7.1 — actuals are useless unless something
 * actually writes them, and dangerous if written by a path that can overwrite a
 * recorded date. The behavioural rules live in
 * src/lib/schedule/__tests__/actuals.test.ts; this file pins the integration:
 * that the payload sanitizer lets the columns through instead of silently
 * dropping them, and how the Task List and drawer present them. Which call
 * sites stamp is covered by running them, in scheduleWritePath.behaviour.test.ts.
 */

const LIST_SRC = readFileSync(
  new URL("../../../components/schedule/ScheduleTaskList.jsx", import.meta.url),
  "utf8",
);
const DRAWER_SRC = readFileSync(
  new URL("../../../components/schedule/TaskDetailDrawer.jsx", import.meta.url),
  "utf8",
);

describe("the payload sanitizer carries actuals through", () => {
  it("does not drop the new columns", () => {
    // sanitize is a denylist (strips _-prefixed and undefined), so a new column
    // passes by default — but if it ever becomes an allowlist, this fails loudly
    // rather than actuals silently never reaching the database.
    const { fields } = sanitizeScheduleTaskUpdatePayload({
      id: "t1",
      status: "Complete",
      actual_start_date: "2026-09-01",
      actual_finish_date: "2026-09-05",
    } as never);

    expect(fields.actual_start_date).toBe("2026-09-01");
    expect(fields.actual_finish_date).toBe("2026-09-05");
  });

  it("rejects an inverted actual window before the database has to", () => {
    // Mirrors schedule_tasks_actual_range_chk. Without this the user gets a raw
    // Postgres constraint name instead of a sentence naming the field to fix.
    expect(() =>
      assertScheduleDateRange({
        start_date: null,
        end_date: null,
        actual_start_date: "2026-09-10",
        actual_finish_date: "2026-09-01",
      }),
    ).toThrow(/Actual finish cannot be before the actual start/);
  });

  it("still rejects an inverted planned window, and says which pair is wrong", () => {
    expect(() =>
      assertScheduleDateRange({ start_date: "2026-09-10", end_date: "2026-09-01" }),
    ).toThrow(/Finish date cannot be before the start date/);
  });

  it("treats a half-known actual window as valid — started, not yet finished", () => {
    expect(() =>
      assertScheduleDateRange({
        start_date: null, end_date: null,
        actual_start_date: "2026-09-10", actual_finish_date: null,
      }),
    ).not.toThrow();
  });
});

// The write paths that stamp actuals — per task in the bulk toolbar, only on a
// real status transition, never over a typed date or an explicit null, and
// validated after the merge — are covered BEHAVIOURALLY in
// scheduleWritePath.behaviour.test.ts, which runs the real hook and asserts on
// the payload sent. They used to be regexes over useScheduleMutations.ts here,
// and those passed while the bulk toolbar was sending `percent_complete:
// undefined` for a reopen: the text they looked for was present, the payload
// was wrong.

describe("the variance column", () => {
  it("cell and tooltip read the same source", () => {
    // Two independent derivations would eventually disagree, and the tooltip is
    // the only thing that distinguishes "no actual recorded" from "on time".
    expect(LIST_SRC).toMatch(/title=\{describeVariance\(varianceFor\(task\)\)\}/);
    expect(LIST_SRC).toMatch(/\{formatVariance\(varianceFor\(task\)\)\}/);
  });

  it("never colours an unrecorded actual as success", () => {
    // A green dash would assert an on-time finish the data does not support.
    const colors = LIST_SRC.slice(LIST_SRC.indexOf("const VARIANCE_COLORS"));
    const block = colors.slice(0, colors.indexOf("};"));
    expect(block).toMatch(/unknown:\s*"var\(--text-muted\)"/);
    expect(block).toMatch(/late:\s*"var\(--status-error\)"/);
    expect(block).not.toMatch(/unknown:\s*"var\(--status-success\)"/);
  });

  it("has a grid track, so the header and cells stay aligned", () => {
    // TASK_LIST_COLUMNS and GRID are edited separately; a column added to one
    // and not the other shifts every cell in the row by one.
    const columns = LIST_SRC.slice(
      LIST_SRC.indexOf("const TASK_LIST_COLUMNS"),
      LIST_SRC.indexOf("const sortByDate"),
    );
    const columnCount = (columns.match(/\{ key:/g) || []).length;
    const grid = /const GRID = "([^"]+)"/.exec(LIST_SRC)?.[1] ?? "";
    expect(columns).toContain('key: "variance"');
    expect(grid.trim().split(/\s+/)).toHaveLength(columnCount);
  });
});

describe("the drawer actuals panel", () => {
  it("renders both fields and explains a blank variance in words", () => {
    expect(DRAWER_SRC).toMatch(/value=\{formData\.actual_start_date\}/);
    expect(DRAWER_SRC).toMatch(/value=\{formData\.actual_finish_date\}/);
    expect(DRAWER_SRC).toMatch(/describeVariance\(computeFinishVariance\(formData\)\)/);
  });

  it("hides the panel on summary rows, whose dates roll up from children", () => {
    const panel = DRAWER_SRC.slice(DRAWER_SRC.indexOf("{/* Actuals"));
    expect(panel.slice(0, 900)).toContain("{!isSummary && (");
  });
});
