import { describe, it, expect } from "vitest";
import { buildRfiPrefillFromDelta, buildRfiPrefillFromSummary } from "@/lib/rfiFromDelta";

describe("buildRfiPrefillFromDelta", () => {
  it("builds a titled, prioritized prefill from a critical material-change delta", () => {
    const p = buildRfiPrefillFromDelta({
      sheet_number: "S2.1", delta_type: "material_change", severity: "critical",
      description: "Beam at B/2: W24x76 -> W24x94", recommended_action: "Confirm member size",
    });
    expect(p.title).toContain("S2.1");
    expect(p.title.toLowerCase()).toContain("material");
    expect(p.priority).toBe("Critical");
    expect(p.drawing_reference).toBe("S2.1");
    expect(p.question).toContain("W24x76");
    expect(p.question).toContain("Confirm member size");
  });

  it("maps severities and falls back gracefully", () => {
    expect(buildRfiPrefillFromDelta({ severity: "high", delta_type: "grid_shift" }).priority).toBe("High");
    expect(buildRfiPrefillFromDelta({ severity: "low", delta_type: "other" }).priority).toBe("Medium");
    expect(buildRfiPrefillFromDelta({}).priority).toBe("Medium");
    // sheet number can come from the option when the delta lacks one
    expect(buildRfiPrefillFromDelta(null, { sheetNumber: "A1" }).drawing_reference).toBe("A1");
  });

  it("clamps an oversized title to 200 chars", () => {
    const p = buildRfiPrefillFromDelta({ sheet_number: "X".repeat(300), delta_type: "other", severity: "low", description: "d" });
    expect(p.title.length).toBeLessThanOrEqual(200);
  });
});

describe("buildRfiPrefillFromSummary", () => {
  it("builds a High-priority prefill from a high-impact summary with likely-RFI sheets", () => {
    const p = buildRfiPrefillFromSummary({
      setName: "Main Steel - IFC",
      sheetsChanged: 3,
      highRiskCount: 2,
      highRisk: [{ sheetNumber: "S2.1", reason: "in the field" }, { sheetNumber: "S3.0", reason: "delivered" }],
      likelyRfi: { needed: true, reason: "High-risk changes after fabrication", sheets: ["S2.1", "S3.0"] },
      impact: { level: "high", note: "Changes hit fabricated/in-field sheets." },
    });
    expect(p.title).toContain("Main Steel - IFC");
    expect(p.priority).toBe("High");
    expect(p.drawing_reference).toBe("S2.1, S3.0");
    expect(p.question).toContain("High-risk changes after fabrication");
    expect(p.question).toContain("S2.1");
  });

  it("falls back gracefully on a sparse/empty summary", () => {
    const p = buildRfiPrefillFromSummary({});
    expect(p.priority).toBe("Medium");
    expect(p.drawing_reference).toBe("");
    expect(p.title).toContain("[Rev]");
  });

  it("clamps an oversized set name in the title to 200 chars", () => {
    const p = buildRfiPrefillFromSummary({ setName: "X".repeat(300) });
    expect(p.title.length).toBeLessThanOrEqual(200);
  });
});
