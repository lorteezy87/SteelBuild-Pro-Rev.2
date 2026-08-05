import { describe, expect, it } from "vitest";
import { EMPTY_PROJECT_FORM, JOB_TYPES } from "../projectFormModalHelpers";

describe("projectFormModalHelpers", () => {
  it("empty form defaults", () => {
    expect(EMPTY_PROJECT_FORM.contract_type).toBe("Lump Sum");
    expect(EMPTY_PROJECT_FORM.phase).toBe("Detailing");
    expect(EMPTY_PROJECT_FORM.retainage_percent).toBe(10);
    expect(EMPTY_PROJECT_FORM.job_type).toBeNull();
  });

  it("job types match constraint catalog", () => {
    expect(JOB_TYPES).toContain("Beams/Deck");
    expect(JOB_TYPES).toContain("Other");
    expect(JOB_TYPES).toHaveLength(7);
  });
});
