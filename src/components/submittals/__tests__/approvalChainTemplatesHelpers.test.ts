import { describe, expect, it } from "vitest";
import { normalizeCustomApprovalTemplates } from "../approvalChainTemplatesHelpers";

describe("normalizeCustomApprovalTemplates", () => {
  it("maps steps to parties and drops empty", () => {
    const rows = normalizeCustomApprovalTemplates(
      [
        { key: "k1", name: "A", steps: [{ party: "EOR" }, { party: "GC" }] },
        { key: "k2", name: "B", steps: [] },
      ],
      (steps: any) => steps,
      () => "generated",
    );
    expect(rows).toEqual([{ key: "k1", name: "A", steps: ["EOR", "GC"] }]);
  });
  it("returns empty for non-array", () => {
    expect(normalizeCustomApprovalTemplates(null, () => [])).toEqual([]);
  });
});
