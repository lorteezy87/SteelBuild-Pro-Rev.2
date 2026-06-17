import { describe, it, expect } from "vitest";
import {
  DRAFTING_STATES,
  RELEASE_STATES,
  DETAILING_STATE_ORDER,
  isDraftingState,
  isReleaseState,
  hasGoverningSubmittal,
  effectiveDetailingState,
  isPackageSuperseded,
  isPackageRR,
  compareDetailingStates,
} from "@/lib/detailingPackageState";

// Submittal fixtures (status, ball_in_court) → derived stage via submittalStageMapping:
const SUB_OFA = { status: "Submitted", ball_in_court: "EOR" };          // → OFA
const SUB_IFC = { status: "Approved", ball_in_court: "GC" };            // → IFC
const SUB_RELEASED = { status: "Released for Fabrication" };            // → Released
const SUB_VOID = { status: "Void" };                                   // → null (no signal)

describe("DETAILING_STATE_ORDER", () => {
  it("splices drafting before the submittal stages and release after", () => {
    expect(DETAILING_STATE_ORDER).toEqual([
      "Not Started",
      "In Detailing", "Internal Review", "Ready to Submit",
      "IFA", "OFA", "BFA", "OFS", "IFC", "Released",
      "Partially Released", "Released for Erection",
    ]);
  });
  it("classifies drafting vs release states", () => {
    expect(DRAFTING_STATES.every(isDraftingState)).toBe(true);
    expect(RELEASE_STATES.every(isReleaseState)).toBe(true);
    expect(isDraftingState("IFA")).toBe(false);
    expect(isReleaseState("Released")).toBe(false);
  });
});

describe("hasGoverningSubmittal", () => {
  it("is true for a submittal with a usable workflow signal", () => {
    expect(hasGoverningSubmittal([SUB_OFA])).toBe(true);
  });
  it("ignores void / deleted submittals", () => {
    expect(hasGoverningSubmittal([SUB_VOID])).toBe(false);
    expect(hasGoverningSubmittal([{ ...SUB_OFA, is_deleted: true }])).toBe(false);
    expect(hasGoverningSubmittal([])).toBe(false);
  });
});

describe("effectiveDetailingState — precedence", () => {
  it("1. a release state wins even when a submittal would say Released", () => {
    const pkg = { detailing_state: "Released for Erection" };
    expect(effectiveDetailingState(pkg, [SUB_RELEASED])).toBe("Released for Erection");
  });

  it("1b. Partially Released wins over an in-flight submittal stage", () => {
    const pkg = { detailing_state: "Partially Released" };
    expect(effectiveDetailingState(pkg, [SUB_OFA])).toBe("Partially Released");
  });

  it("2. a governing submittal beats a stale drafting state", () => {
    const pkg = { detailing_state: "In Detailing" };
    // submittal says OFA → submittal governs, drafting is ignored
    expect(effectiveDetailingState(pkg, [SUB_OFA])).toBe("OFA");
    expect(effectiveDetailingState(pkg, [SUB_IFC])).toBe("IFC");
  });

  it("3. a drafting state is used when no submittal governs", () => {
    const pkg = { detailing_state: "Internal Review" };
    expect(effectiveDetailingState(pkg, [])).toBe("Internal Review");
    expect(effectiveDetailingState(pkg, [SUB_VOID])).toBe("Internal Review");
  });

  it("4. falls back to the legacy sheet-derived stage when no submittal/drafting", () => {
    const pkg = { detailing_state: null };
    expect(effectiveDetailingState(pkg, [], [{ stage: "IFC" }, { stage: "IFC" }])).toBe("IFC");
  });

  it("4b. Not Started when there is no signal at all", () => {
    expect(effectiveDetailingState({}, [], [])).toBe("Not Started");
    expect(effectiveDetailingState(null, null, null)).toBe("Not Started");
  });
});

describe("isPackageSuperseded", () => {
  it("true only when the package has sheets and all are superseded", () => {
    expect(isPackageSuperseded([{ is_superseded: true }, { is_superseded: true }])).toBe(true);
    expect(isPackageSuperseded([{ is_superseded: true }, { is_superseded: false }])).toBe(false);
    expect(isPackageSuperseded([])).toBe(false);
    expect(isPackageSuperseded([{ is_superseded: true, is_deleted: true }])).toBe(false);
  });
});

describe("isPackageRR", () => {
  const RR = { status: "Revise and Resubmit", submitted_date: "2026-06-13", round_number: 2 };
  const RELEASED = { status: "Released for Fabrication", submitted_date: "2026-06-20", round_number: 3 };

  it("true when the governing (most-recent active) submittal is R&R or Rejected", () => {
    expect(isPackageRR([RR])).toBe(true);
    expect(isPackageRR([{ status: "Rejected", submitted_date: "2026-06-13" }])).toBe(true);
  });

  it("false once a newer round advances past R&R (the released round governs)", () => {
    expect(isPackageRR([RR, RELEASED])).toBe(false);
  });

  it("ignores deleted submittals — a deleted Released round doesn't suppress an active R&R", () => {
    // The real "Main Steel - Bldg. 1" case: round-1 Released soft-deleted, round-2 R&R active.
    expect(isPackageRR([RR, { ...RELEASED, is_deleted: true }])).toBe(true);
  });

  it("false for empty / non-R&R / void-only / null", () => {
    expect(isPackageRR([])).toBe(false);
    expect(isPackageRR([SUB_OFA])).toBe(false);
    expect(isPackageRR([SUB_VOID])).toBe(false);
    expect(isPackageRR(null)).toBe(false);
  });
});

describe("compareDetailingStates", () => {
  it("orders along the operational pipeline", () => {
    expect(compareDetailingStates("In Detailing", "IFA")).toBeLessThan(0);
    expect(compareDetailingStates("Released", "Released for Erection")).toBeLessThan(0);
    expect(compareDetailingStates("OFA", "IFA")).toBeGreaterThan(0);
  });
});
