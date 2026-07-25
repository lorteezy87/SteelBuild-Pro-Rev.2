import { describe, expect, it } from "vitest";
import {
  OFS_CHECKLIST_ITEMS,
  evaluateOfsIfcGate,
  evaluateOfsToOfaGate,
  evaluateSkipOfsReleaseGate,
  isOfsChecklistComplete,
} from "@/lib/ofsCompletionGate";

describe("OFS checklist", () => {
  it("lists the four completion items", () => {
    expect(OFS_CHECKLIST_ITEMS.map((i) => i.key)).toEqual([
      "comments_addressed",
      "markups_incorporated",
      "sheets_ready",
      "authorized_to_issue",
    ]);
  });

  it("is incomplete until every item is checked", () => {
    expect(isOfsChecklistComplete({})).toBe(false);
    expect(
      isOfsChecklistComplete({
        comments_addressed: true,
        markups_incorporated: true,
        sheets_ready: true,
        authorized_to_issue: false,
      }),
    ).toBe(false);
    expect(
      isOfsChecklistComplete({
        comments_addressed: true,
        markups_incorporated: true,
        sheets_ready: true,
        authorized_to_issue: true,
      }),
    ).toBe(true);
  });
});

describe("evaluateOfsIfcGate", () => {
  it("allows non-OFS→IFC moves", () => {
    const r = evaluateOfsIfcGate({
      priorStatus: "Submitted",
      priorBallInCourt: "EOR",
      nextStage: "BFA",
      checklist: {},
    });
    expect(r.ok).toBe(true);
  });

  it("blocks OFS→IFC when checklist is incomplete", () => {
    const r = evaluateOfsIfcGate({
      priorStatus: "Approved as Noted",
      priorBallInCourt: "Detailer",
      nextStage: "IFC",
      checklist: { comments_addressed: true },
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toMatch(/^OFS_IFC_BLOCKED:/);
      expect(r.missing.length).toBeGreaterThan(0);
    }
  });

  it("allows OFS→IFC when checklist is complete", () => {
    const r = evaluateOfsIfcGate({
      priorStatus: "Approved as Noted",
      priorBallInCourt: "Detailer",
      nextStage: "IFC",
      checklist: {
        comments_addressed: true,
        markups_incorporated: true,
        sheets_ready: true,
        authorized_to_issue: true,
      },
    });
    expect(r.ok).toBe(true);
  });

  it("allows OFS→IFC with audited override reason when checklist incomplete", () => {
    const r = evaluateOfsIfcGate({
      priorStatus: "Approved",
      priorBallInCourt: "Detailer",
      nextStage: "IFC",
      checklist: {},
      overrideReason: "PM authorized skip — field release critical path",
    });
    expect(r.ok).toBe(true);
  });
});

describe("evaluateOfsToOfaGate", () => {
  it("blocks OFS → Submitted/Under Review without override", () => {
    for (const nextStatus of ["Submitted", "Under Review"]) {
      const r = evaluateOfsToOfaGate({
        priorStatus: "Approved as Noted",
        priorBallInCourt: "Detailer",
        nextStatus,
      });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.reason).toMatch(/^OFS_TO_OFA_BLOCKED:/);
    }
  });

  it("allows OFS → OFA with audited override reason", () => {
    const r = evaluateOfsToOfaGate({
      priorStatus: "Approved as Noted",
      priorBallInCourt: "Detailer",
      nextStatus: "Submitted",
      overrideReason: "Returned to reviewer for clarification",
    });
    expect(r.ok).toBe(true);
  });

  it("does not block non-OFS sources", () => {
    const r = evaluateOfsToOfaGate({
      priorStatus: "Approved as Noted",
      priorBallInCourt: "EOR", // BFA
      nextStatus: "Submitted",
    });
    // BFA→OFA is a different prohibition; this gate only covers OFS.
    expect(r.ok).toBe(true);
  });
});

describe("evaluateSkipOfsReleaseGate", () => {
  it("blocks Released for Fab from BFA (skip OFS+IFC)", () => {
    const r = evaluateSkipOfsReleaseGate({
      priorStatus: "Approved",
      priorBallInCourt: "EOR",
      nextStatus: "Released for Fabrication",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/^OFS_SKIP_BLOCKED:/);
  });

  it("blocks Released for Fab from OFS (skip IFC)", () => {
    const r = evaluateSkipOfsReleaseGate({
      priorStatus: "Approved as Noted",
      priorBallInCourt: "Detailer",
      nextStatus: "Released for Fabrication",
    });
    expect(r.ok).toBe(false);
  });

  it("allows Released for Fab from IFC", () => {
    const r = evaluateSkipOfsReleaseGate({
      priorStatus: "Approved",
      priorBallInCourt: "GC",
      nextStatus: "Released for Fabrication",
    });
    expect(r.ok).toBe(true);
  });

  it("allows skip with audited override reason", () => {
    const r = evaluateSkipOfsReleaseGate({
      priorStatus: "Approved",
      priorBallInCourt: "EOR",
      nextStatus: "Released for Fabrication",
      overrideReason: "Emergency release authorized by PM",
    });
    expect(r.ok).toBe(true);
  });
});
