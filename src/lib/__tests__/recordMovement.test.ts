import { describe, expect, it } from "vitest";
import { DRAWING_SET_TRACKED_FIELDS, SUBMITTAL_TRACKED_FIELDS, buildRecordMoves, describeMove } from "../recordMovement";
import type { AuditRow } from "../recordMovement";

const base = { id: "s1", status: "Under Review", ball_in_court: "EOR", round_number: 1, updated_at: "2026-07-01" };

describe("buildRecordMoves", () => {
  it("returns tracked changes newest first and drops untracked-only updates", () => {
    const rows: AuditRow[] = [
      { created_at: "2026-07-01T10:00:00Z", action: "INSERT", new_values: { ...base, status: "Draft", ball_in_court: null } },
      { created_at: "2026-07-02T10:00:00Z", action: "UPDATE", old_values: { ...base, status: "Draft", ball_in_court: null }, new_values: { ...base } },
      // updated_at only — noise.
      { created_at: "2026-07-03T10:00:00Z", action: "UPDATE", old_values: { ...base }, new_values: { ...base, updated_at: "2026-07-03" } },
      { created_at: "2026-07-10T10:00:00Z", action: "UPDATE", old_values: { ...base }, new_values: { ...base, status: "Revise and Resubmit", ball_in_court: "Detailer" } },
    ];
    const moves = buildRecordMoves(rows, SUBMITTAL_TRACKED_FIELDS);
    expect(moves.map((m) => m.at)).toEqual(["2026-07-10T10:00:00Z", "2026-07-02T10:00:00Z", "2026-07-01T10:00:00Z"]);
    expect(moves[0].changes).toEqual([
      { key: "status", label: "Status", from: "Under Review", to: "Revise and Resubmit" },
      { key: "ball_in_court", label: "Ball in court", from: "EOR", to: "Detailer" },
    ]);
    expect(describeMove(moves[0])).toBe("Status Under Review → Revise and Resubmit · Ball in court EOR → Detailer");
    expect(moves[2].kind).toBe("created");
    expect(describeMove(moves[2])).toBe("Created · Status Draft · Round 1");
  });

  it("treats blank strings as empty so '' → null is not a move", () => {
    const rows: AuditRow[] = [
      { created_at: "2026-07-02", action: "UPDATE", old_values: { reviewer: "" }, new_values: { reviewer: null } },
    ];
    expect(buildRecordMoves(rows, SUBMITTAL_TRACKED_FIELDS)).toHaveLength(0);
  });

  it("reports a foreign-key change without exposing the id", () => {
    const rows: AuditRow[] = [
      { created_at: "2026-07-02", action: "UPDATE", old_values: { current_submittal_id: null }, new_values: { current_submittal_id: "0d2c…" } },
      { created_at: "2026-07-03", action: "UPDATE", old_values: { current_submittal_id: "0d2c…" }, new_values: { current_submittal_id: "77aa…" } },
      { created_at: "2026-07-04", action: "UPDATE", old_values: { current_submittal_id: "77aa…" }, new_values: { current_submittal_id: null } },
    ];
    const moves = buildRecordMoves(rows, DRAWING_SET_TRACKED_FIELDS);
    expect(moves.map((m) => describeMove(m))).toEqual([
      "Governing submittal cleared",
      "Governing submittal changed",
      "Governing submittal linked",
    ]);
  });

  it("formats booleans, caps the list and summarises extra changes", () => {
    const rows: AuditRow[] = Array.from({ length: 8 }, (_, i) => ({
      created_at: `2026-07-${String(i + 1).padStart(2, "0")}`,
      action: "UPDATE",
      old_values: { is_locked: false, status: "a", revision: String(i), detailing_state: "x", locked_reason: null },
      new_values: { is_locked: true, status: "b", revision: String(i + 1), detailing_state: "y", locked_reason: "QA" },
    }));
    const moves = buildRecordMoves(rows, DRAWING_SET_TRACKED_FIELDS, 3);
    expect(moves).toHaveLength(3);
    expect(describeMove(moves[0])).toBe("Detailing state x → y · Status a → b · Revision 7 → 8 · +2 more");
    expect(moves[0].changes.find((c) => c.key === "is_locked")).toMatchObject({ from: "No", to: "Yes" });
  });

  it("records deletes and ignores unknown actions", () => {
    const rows: AuditRow[] = [
      { created_at: "2026-07-02", action: "DELETE", old_values: { status: "Draft" } },
      { created_at: "2026-07-03", action: "TRUNCATE" },
    ];
    const moves = buildRecordMoves(rows, SUBMITTAL_TRACKED_FIELDS);
    expect(moves).toHaveLength(1);
    expect(describeMove(moves[0])).toBe("Record deleted");
  });
});
