import { describe, expect, it } from "vitest";
import {
  parseCsv,
  buildSequence,
  buildBulkSubmittalPreview,
  enrichBulkSubmittalRows,
  clampToEnum,
} from "../submittalBulkAddHelpers";

describe("buildSequence", () => {
  it("pads increments", () => {
    expect(buildSequence("S-001", 3)).toEqual(["S-001", "S-002", "S-003"]);
  });
});

describe("parseCsv / preview", () => {
  it("parses header + rows", () => {
    const { rows } = parseCsv("Number,Title\nS-1,Baseplates\nS-2,Columns");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
  it("builds sequential preview", () => {
    const p = buildBulkSubmittalPreview({
      mode: "seq",
      csvText: "",
      seqStart: "S-010",
      seqCount: 2,
      seqTitlePrefix: "Item",
    });
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].title).toBe("Item 1");
  });
});

describe("enrichBulkSubmittalRows", () => {
  it("clamps enums and backfills title/number", () => {
    const [r] = enrichBulkSubmittalRows([
      { submittal_number: "S-1", submittal_type: "shop drawing", status: "draft" },
    ]);
    expect(r.title).toBe("S-1");
    expect(r.status).toBe("Draft");
    expect(clampToEnum("shop drawing", ["Shop Drawing"])).toBe("Shop Drawing");
  });
});
