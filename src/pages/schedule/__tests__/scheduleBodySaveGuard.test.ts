import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";

/**
 * Regression cover for a fully SILENT failed save on the Gantt and Task List.
 *
 * Both `onSave` handlers in ScheduleBody called
 * `sanitizeScheduleTaskUpdatePayload(data)` on the line ABOVE their `try`.
 * That call runs `assertScheduleDateRange`, which throws on an inverted window.
 * A throw from there therefore bypassed the `catch` that renders
 * `toast.error("Save failed: ...")` — so dragging or inline-editing a row into
 * an end-before-start state rejected the write with no feedback whatsoever: no
 * toast, no bar movement, nothing.
 *
 * The fix is positional, so the cover is positional too: assert the call sits
 * inside the try in both handlers.
 */

const BODY_SRC = readFileSync(new URL("../ScheduleBody.tsx", import.meta.url), "utf8");

/**
 * The body of each `onSave={async (data: ScheduleTask) => { ... }}` handler.
 *
 * Sliced to the next handler (or end of file) rather than a fixed character
 * count: a fixed window silently truncates the moment anyone adds a comment,
 * which turns a real assertion into a false failure.
 */
function onSaveBodies(src: string): string[] {
  const marker = "onSave={async (data: ScheduleTask) => {";
  const starts: number[] = [];
  let i = src.indexOf(marker);
  while (i !== -1) {
    starts.push(i);
    i = src.indexOf(marker, i + 1);
  }
  return starts.map((start, n) => src.slice(start, starts[n + 1] ?? src.length));
}

describe("sanitize throws are caught and surfaced", () => {
  it("assertScheduleDateRange really does throw through sanitize", () => {
    // If this ever stops throwing, the positional assertions below are moot and
    // should be revisited rather than silently passing.
    expect(() =>
      sanitizeScheduleTaskUpdatePayload({
        id: "t1",
        start_date: "2026-05-10",
        end_date: "2026-05-01",
      } as never),
    ).toThrow(/Finish date cannot be before the start date/);
  });

  it("every ScheduleBody onSave calls sanitize INSIDE its try", () => {
    const bodies = onSaveBodies(BODY_SRC);
    expect(bodies.length).toBeGreaterThanOrEqual(2); // Gantt + Task List

    for (const body of bodies) {
      const tryIdx = body.indexOf("try {");
      const sanitizeIdx = body.indexOf("sanitizeScheduleTaskUpdatePayload(");
      expect(tryIdx, "handler has a try block").toBeGreaterThan(-1);
      expect(sanitizeIdx, "handler calls sanitize").toBeGreaterThan(-1);
      // The whole point: sanitize must come AFTER `try {`, not before it.
      expect(sanitizeIdx).toBeGreaterThan(tryIdx);
    }
  });

  it("each handler still surfaces the failure to the user", () => {
    for (const body of onSaveBodies(BODY_SRC)) {
      expect(body).toContain("catch");
      expect(body).toContain("Save failed: ");
    }
  });
});
