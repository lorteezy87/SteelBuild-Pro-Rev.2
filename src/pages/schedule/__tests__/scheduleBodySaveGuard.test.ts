import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";

/**
 * Regression cover for a fully SILENT failed save on the Gantt and Task List.
 *
 * Both `onSave` handlers in ScheduleBody used to inline their own write:
 * `sanitizeScheduleTaskUpdatePayload(data)` on the line ABOVE their `try`, then
 * `entities.ScheduleTask.update`. Sanitize runs `assertScheduleDateRange`,
 * which throws on an inverted window — so a throw from there bypassed the
 * `catch` that renders `toast.error(...)`, and dragging or inline-editing a row
 * into an end-before-start state rejected the write with no feedback at all: no
 * toast, no bar movement, nothing.
 *
 * The original fix was positional (move sanitize inside the try) and so was
 * this cover. §4.2 replaced it with a structural one: ScheduleBody no longer
 * writes anything. Both handlers delegate to `updateTaskMut`, whose `onError`
 * is the single place a failed save is reported, so the failure mode cannot be
 * reintroduced by moving a line — only by re-adding a write, which is what this
 * file now asserts against.
 *
 * That is a strictly stronger guarantee: the old version could pass while a
 * third handler wrote directly, because it only inspected handlers matching one
 * exact `async (data: ScheduleTask)` signature.
 */

const BODY_SRC = readFileSync(new URL("../ScheduleBody.tsx", import.meta.url), "utf8");

/** Every `onSave={...}` prop value in ScheduleBody, whatever its shape. */
function onSaveHandlers(src: string): string[] {
  const marker = "onSave={";
  const found: string[] = [];
  let i = src.indexOf(marker);
  while (i !== -1) {
    // To the end of the line is enough: a delegating handler is a one-liner,
    // and anything longer is exactly what this file is trying to catch.
    const eol = src.indexOf("\n", i);
    found.push(src.slice(i, eol === -1 ? src.length : eol));
    i = src.indexOf(marker, i + 1);
  }
  return found;
}

describe("sanitize throws are caught and surfaced", () => {
  it("assertScheduleDateRange really does throw through sanitize", () => {
    // If this ever stops throwing, the assertions below are moot and should be
    // revisited rather than silently passing.
    expect(() =>
      sanitizeScheduleTaskUpdatePayload({
        id: "t1",
        start_date: "2026-05-10",
        end_date: "2026-05-01",
      } as never),
    ).toThrow(/Finish date cannot be before the start date/);
  });

  it("ScheduleBody writes nothing itself", () => {
    // The class of bug, removed at the root: a component that cannot call the
    // database cannot swallow the database's errors.
    expect(BODY_SRC).not.toContain("entities.");
    expect(BODY_SRC).not.toContain("sanitizeScheduleTaskUpdatePayload");
    expect(BODY_SRC).not.toContain("invalidateEntity");
  });

  it("every onSave delegates to the canonical mutation", () => {
    const handlers = onSaveHandlers(BODY_SRC);
    expect(handlers.length).toBeGreaterThanOrEqual(2); // Gantt + Task List

    for (const handler of handlers) {
      // mutateAsync, not mutate: the Gantt's and Task List's own commitEdit
      // await this and keep the inline editor open when it rejects. `mutate`
      // returns undefined, so the await resolves immediately and a failed save
      // would close the editor and discard what the user typed.
      expect(handler, "onSave routes through updateTaskMut").toContain(
        "updateTaskMut.mutateAsync",
      );
    }
  });

  // What updateTaskMut does with a failed save — reports it once as "Update
  // failed: …", rolls the optimistic paint back first, and lets a validation
  // throw reach the user rather than the paint swallowing it — is covered by
  // running the hook in scheduleWritePath.behaviour.test.ts. Those used to be
  // regexes over useScheduleMutations.ts here.
});
