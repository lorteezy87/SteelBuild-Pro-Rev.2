import { describe, it, expect } from "vitest";
import {
  buildBackchargePrefillFromSheet,
  sheetsWithRevisionBackcharge,
} from "@/lib/backchargeFromDelta";

describe("buildBackchargePrefillFromSheet", () => {
  it("builds a rework prefill from a downstream sheet with hot deltas", () => {
    const p = buildBackchargePrefillFromSheet({
      sheetNumber: "101E103", downstream: "fabricated",
      deltas: [
        { id: "d1", severity: "critical", description: "W24x76 -> W24x94", recommended_action: "confirm member" },
        { id: "d2", severity: "low", description: "annotation tweak", dismissed: true },
      ],
    });
    expect(p.title).toContain("101E103");
    expect(p.title.toLowerCase()).toContain("fabricated");
    expect(p.reason_code).toBe("rework");
    expect(p.responsible_party_type).toBe("subcontractor");
    expect(p.status).toBe("draft");
    expect(p.amount).toBe(""); // PM fills the $ amount
    expect(p.description).toContain("W24x76");
    expect(p.description).not.toContain("annotation tweak"); // dismissed delta excluded
    expect(p.metadata).toMatchObject({
      source_type: "revision_delta", source_delta_id: "d1", sheet_number: "101E103", severity: "critical",
    });
  });

  it("clamps a long title and tolerates a sheet with no deltas", () => {
    const p = buildBackchargePrefillFromSheet({ sheetNumber: "X".repeat(300), downstream: "delivered", deltas: [] });
    expect(p.title.length).toBeLessThanOrEqual(200);
    expect(p.metadata.source_delta_id).toBeNull();
  });
});

describe("sheetsWithRevisionBackcharge", () => {
  it("collects sheet numbers from revision_delta backcharges only", () => {
    const set = sheetsWithRevisionBackcharge([
      { metadata: { source_type: "revision_delta", sheet_number: "101E103" } },
      { metadata: { source_type: "manual", sheet_number: "101E104" } },
      { metadata: null },
      { id: "x" },
    ]);
    expect(set.has("101E103")).toBe(true);
    expect(set.has("101E104")).toBe(false);
    expect(set.size).toBe(1);
  });

  it("is safe on empty / missing input", () => {
    expect(sheetsWithRevisionBackcharge([]).size).toBe(0);
    expect(sheetsWithRevisionBackcharge(null).size).toBe(0);
  });
});
