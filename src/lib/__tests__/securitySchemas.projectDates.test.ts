import { describe, expect, it } from "vitest";
import { createProjectRecordSchema } from "../securitySchemas";

/**
 * Regression guard for "Invalid project payload: Invalid input" when adding a
 * project.
 *
 * ProjectFormModal initialises start_date / target_completion_date /
 * forecast_completion_date to null. The schema's date union accepted a
 * YYYY-MM-DD string, "" or undefined but not null, and Project.create strips
 * only undefined from the payload — so any project created without filling in
 * a date failed before it ever reached the server.
 *
 * The message was useless because a failed z.union reports Zod's default
 * "Invalid input" with the real reasons buried in unionErrors.
 */

const base = { name: "Tower B", project_number: "2026-014" };

describe("createProjectRecordSchema project dates", () => {
  it("accepts null, which is what the form sends for a blank date", () => {
    const parsed = createProjectRecordSchema.safeParse({
      ...base,
      start_date: null,
      target_completion_date: null,
      forecast_completion_date: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a real date and leaves it alone", () => {
    const parsed = createProjectRecordSchema.safeParse({ ...base, start_date: "2026-09-19" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.start_date).toBe("2026-09-19");
  });

  // create_project casts (project_data->>'start_date')::date with no nullif,
  // so "" would arrive as ''::date and raise a raw Postgres cast error. Both
  // empty forms must converge on null before the RPC sees them.
  it("normalises an empty string to null rather than passing it to the RPC", () => {
    const parsed = createProjectRecordSchema.safeParse({ ...base, start_date: "" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.start_date).toBeNull();
  });

  it("omits an absent date entirely", () => {
    const parsed = createProjectRecordSchema.safeParse(base);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.start_date).toBeUndefined();
  });

  it("still rejects a malformed date", () => {
    const parsed = createProjectRecordSchema.safeParse({ ...base, start_date: "09/19/2026" });

    expect(parsed.success).toBe(false);
  });

  // The two fields that are genuinely required keep their own messages, so a
  // real mistake still reads clearly.
  it("keeps the named messages for required fields", () => {
    const parsed = createProjectRecordSchema.safeParse({ name: "", project_number: "" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages).toContain("Project name is required");
      expect(messages).toContain("Project number is required");
    }
  });

  // Whatever the message, the issue must carry the field path -- that is what
  // turns a bare "Invalid input" into something actionable.
  it("reports the offending field on its issue path", () => {
    const parsed = createProjectRecordSchema.safeParse({ ...base, start_date: "not a date" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "start_date")).toBe(true);
    }
  });
});
