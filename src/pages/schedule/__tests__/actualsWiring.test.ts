import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";
import { assertScheduleDateRange } from "../scheduleDateValidation";

/**
 * Wiring cover for audit §1.4 / §7.1 — actuals are useless unless something
 * actually writes them, and dangerous if written by a path that can overwrite a
 * recorded date. The behavioural rules live in
 * src/lib/schedule/__tests__/actuals.test.ts; this file pins the integration:
 * which call sites stamp, and that the payload sanitizer lets the columns
 * through instead of silently dropping them.
 */

const MUT_SRC = readFileSync(new URL("../useScheduleMutations.ts", import.meta.url), "utf8");
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

describe("the write paths that stamp actuals", () => {
  it("bulk status change derives a patch PER TASK, not once for the batch", () => {
    // The patch depends on what each row has already recorded; hoisting it out
    // of the loop would stamp every task with one shared answer and overwrite
    // real finish dates on the rows that already had one.
    const bulk = MUT_SRC.slice(MUT_SRC.indexOf("const bulkUpdateMut"));
    const body = bulk.slice(0, bulk.indexOf("const bulkDeleteMut"));
    expect(body).toContain("batchProcess(ids");
    expect(body).toMatch(/deriveActualsPatch\(\{\s*task: byId\.get\(id\)/);
  });

  it("bulk status change tells the user it wrote dates", () => {
    const bulk = MUT_SRC.slice(MUT_SRC.indexOf("const bulkUpdateMut"));
    const body = bulk.slice(0, bulk.indexOf("const bulkDeleteMut"));
    // Silently stamping a date onto a task is the class of invisible write this
    // batch exists to remove, so the toast must name it.
    expect(body).toContain("Recorded actual dates on");
  });

  it("the drawer save stamps only on a real status transition", () => {
    const upd = MUT_SRC.slice(MUT_SRC.indexOf("const updateTaskMut"));
    const body = upd.slice(0, upd.indexOf("const reparentMut"));
    // Comparing against the STORED row is what makes this a transition rather
    // than "every save of an already-Complete task re-stamps today".
    expect(body).toMatch(/scheduleTasks\.find\(\(t\) => t\.id === data\.id\)/);
    expect(body).toMatch(/data\.status !== previous\.status/);
  });

  it("a date typed in the drawer wins over the derived stamp", () => {
    const upd = MUT_SRC.slice(MUT_SRC.indexOf("const updateTaskMut"));
    const body = upd.slice(0, upd.indexOf("const reparentMut"));
    // `key in merged` rather than a truthiness check, so an explicit null —
    // the user clearing a wrong actual — is respected instead of re-stamped.
    expect(body).toMatch(/!\(key in merged\)/);
  });

  it("sanitize runs AFTER the merge, so actuals are validated too", () => {
    const upd = MUT_SRC.slice(MUT_SRC.indexOf("const updateTaskMut"));
    const body = upd.slice(0, upd.indexOf("const reparentMut"));
    expect(body.indexOf("deriveActualsPatch")).toBeLessThan(
      body.indexOf("sanitizeScheduleTaskUpdatePayload"),
    );
  });
});

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
