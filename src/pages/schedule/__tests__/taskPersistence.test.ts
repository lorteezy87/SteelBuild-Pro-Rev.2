import { describe, expect, it } from "vitest";
import { sanitizeScheduleTaskUpdatePayload } from "../wbs";

/**
 * Regression: schedule task update payloads must not persist joined / UI-only
 * fields. Create path must preserve project_id when the same strip rules apply.
 */
describe("schedule task persistence (sanitizeScheduleTaskUpdatePayload)", () => {
  it("strips joined / UI (_*) fields and timestamps from the update body", () => {
    const { id, fields } = sanitizeScheduleTaskUpdatePayload({
      id: "task-42",
      task_name: "Erect columns",
      project_id: "proj-abc",
      phase: "Erection",
      duration: 3,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      created_date: "2026-01-01",
      updated_date: "2026-01-02",
      _signals: { risk: "high" },
      _hasChildren: false,
      _joined_project: { name: "Tower" },
    } as any);

    expect(id).toBe("task-42");
    expect(fields).toEqual({
      task_name: "Erect columns",
      project_id: "proj-abc",
      phase: "Erection",
      duration: 3,
    });
    expect(fields).not.toHaveProperty("_signals");
    expect(fields).not.toHaveProperty("_joined_project");
    expect(fields).not.toHaveProperty("created_at");
    expect(fields).not.toHaveProperty("updated_at");
    expect(fields).not.toHaveProperty("created_date");
    expect(fields).not.toHaveProperty("updated_date");
  });

  it("preserves project_id on the sanitized payload (create/update concept)", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload({
      id: "task-new",
      project_id: "proj-keep",
      task_name: "Fab beams",
      wbs_code: "4.1",
      _temp: true,
    } as any);

    expect(fields.project_id).toBe("proj-keep");
    expect(fields.task_name).toBe("Fab beams");
    expect(fields.wbs_code).toBe("4.1");
    expect(fields).not.toHaveProperty("_temp");
  });

  it("drops undefined values and underscore-prefixed invalid fields", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload({
      id: "task-3",
      task_name: "Ship",
      percent_complete: undefined,
      _overlay: { start: "2026-09-01" },
      _isRolledUpSummary: false,
    } as any);

    expect(fields).toEqual({ task_name: "Ship" });
    expect(fields).not.toHaveProperty("percent_complete");
    expect(fields).not.toHaveProperty("_overlay");
    expect(fields).not.toHaveProperty("_isRolledUpSummary");
  });
});
