import { describe, it, expect } from "vitest";
import {
  submittalStatusToStage,
  stageToSubmittalStatus,
  derivedSetStage,
  dominantStage,
  pickMostRecentSubmittal,
  isStageInReview,
} from "../submittalStageMapping";

describe("submittalStatusToStage", () => {
  it("maps Submitted + EOR → OFA", () => {
    expect(submittalStatusToStage("Submitted", "EOR", null)).toBe("OFA");
  });

  it("maps Submitted + non-EOR (GC) → OFS", () => {
    expect(submittalStatusToStage("Submitted", "GC", null)).toBe("OFS");
    expect(submittalStatusToStage("Under Review", "Owner", null)).toBe("OFS");
  });

  it("maps Revise and Resubmit / Rejected → BFA", () => {
    expect(submittalStatusToStage("Revise and Resubmit", "Detailer", null)).toBe("BFA");
    expect(submittalStatusToStage("Rejected", "EOR", null)).toBe("BFA");
  });

  it("maps Approved as Noted → BFS", () => {
    expect(submittalStatusToStage("Approved as Noted", "Detailer", null)).toBe("BFS");
  });

  it("maps Approved without approved_date → FFF (IFC)", () => {
    expect(submittalStatusToStage("Approved", null, null)).toBe("FFF");
  });

  it("maps Approved WITH approved_date → Released", () => {
    expect(submittalStatusToStage("Approved", null, "2025-01-15")).toBe("Released");
  });

  it("maps Released for Fabrication → Released regardless of approved_date", () => {
    expect(submittalStatusToStage("Released for Fabrication", null, null)).toBe("Released");
  });

  it("maps Draft → Not Started", () => {
    expect(submittalStatusToStage("Draft", "EOR", null)).toBe("Not Started");
  });

  it("returns null for Void submittals (terminal-dead, no display)", () => {
    expect(submittalStatusToStage("Void", null, null)).toBeNull();
  });

  it("returns null for unknown / missing status strings", () => {
    expect(submittalStatusToStage(null, null, null)).toBeNull();
    expect(submittalStatusToStage("Bananas", null, null)).toBeNull();
  });
});

describe("stageToSubmittalStatus", () => {
  it("returns sensible canonical (status, BIC) for every workflow stage", () => {
    expect(stageToSubmittalStatus("OFA")).toMatchObject({ status: "Submitted",            ball_in_court: "EOR" });
    expect(stageToSubmittalStatus("BFA")).toMatchObject({ status: "Revise and Resubmit",  ball_in_court: "Detailer" });
    expect(stageToSubmittalStatus("OFS")).toMatchObject({ status: "Submitted",            ball_in_court: "GC" });
    expect(stageToSubmittalStatus("BFS")).toMatchObject({ status: "Approved as Noted",    ball_in_court: "Detailer" });
    expect(stageToSubmittalStatus("FFF")).toMatchObject({ status: "Approved" });
    expect(stageToSubmittalStatus("Released")).toMatchObject({ status: "Released for Fabrication" });
  });

  it("Not Started → Draft (caller can choose to skip submittal creation)", () => {
    expect(stageToSubmittalStatus("Not Started")).toMatchObject({ status: "Draft" });
  });

  it("returns null for unknown stage strings", () => {
    expect(stageToSubmittalStatus("Junk")).toBeNull();
  });

  it("status→stage→status round-trip stays canonical for the core workflow", () => {
    for (const stage of ["OFA", "BFA", "OFS", "BFS", "FFF", "Released"]) {
      const { status, ball_in_court } = stageToSubmittalStatus(stage);
      // Released is sometimes derived from Approved+approved_date in
      // the inverse direction — both map BACK to Released, which is
      // what we want.
      const back = submittalStatusToStage(status, ball_in_court, status === "Released for Fabrication" ? null : null);
      // FFF needs special handling: stageToSubmittalStatus returns
      // Approved (no date) which maps back to FFF — correct.
      expect(back).toBe(stage);
    }
  });
});

describe("dominantStage", () => {
  it("picks the most-common valid stage", () => {
    expect(dominantStage(["OFA", "OFA", "BFA"])).toBe("OFA");
    expect(dominantStage(["BFS", "BFS", "BFS"])).toBe("BFS");
  });

  it("on tie, picks the earliest in canonical order", () => {
    // Three OFA, three BFA — OFA wins.
    expect(dominantStage(["OFA", "BFA", "OFA", "BFA", "OFA", "BFA"])).toBe("OFA");
  });

  it("ignores unknown strings", () => {
    expect(dominantStage(["bogus", "junk", "OFA"])).toBe("OFA");
  });

  it("returns Not Started for empty / all-invalid input", () => {
    expect(dominantStage([])).toBe("Not Started");
    expect(dominantStage(["junk", "more junk"])).toBe("Not Started");
    expect(dominantStage(null)).toBe("Not Started");
  });
});

describe("pickMostRecentSubmittal", () => {
  it("picks the latest by submitted_date", () => {
    const a = { id: "a", submitted_date: "2025-01-01", updated_at: "2025-01-01T00:00:00Z" };
    const b = { id: "b", submitted_date: "2025-03-15", updated_at: "2025-03-15T00:00:00Z" };
    expect(pickMostRecentSubmittal([a, b])?.id).toBe("b");
  });

  it("falls back to updated_at when submitted_date matches", () => {
    const a = { id: "a", submitted_date: "2025-01-01", updated_at: "2025-01-02T00:00:00Z" };
    const b = { id: "b", submitted_date: "2025-01-01", updated_at: "2025-01-05T00:00:00Z" };
    expect(pickMostRecentSubmittal([a, b])?.id).toBe("b");
  });

  it("filters soft-deleted rows", () => {
    const a = { id: "a", submitted_date: "2025-03-15", is_deleted: true };
    const b = { id: "b", submitted_date: "2025-01-01" };
    expect(pickMostRecentSubmittal([a, b])?.id).toBe("b");
  });

  it("returns null for empty input", () => {
    expect(pickMostRecentSubmittal([])).toBeNull();
    expect(pickMostRecentSubmittal(null)).toBeNull();
  });
});

describe("derivedSetStage", () => {
  it("uses the most-recent active submittal's status", () => {
    const subs = [
      { id: "s1", submitted_date: "2025-01-01", status: "Submitted", ball_in_court: "EOR" },
      { id: "s2", submitted_date: "2025-04-10", status: "Approved as Noted", ball_in_court: "Detailer" },
    ];
    expect(derivedSetStage(subs, [])).toBe("BFS");
  });

  it("falls back to dominant sheet.stage when no submittal exists", () => {
    expect(derivedSetStage([], [
      { stage: "OFA" }, { stage: "OFA" }, { stage: "BFA" },
    ])).toBe("OFA");
  });

  it("ignores Void submittals when picking most-recent", () => {
    const subs = [
      { id: "s1", submitted_date: "2025-04-20", status: "Void" },
      { id: "s2", submitted_date: "2025-01-15", status: "Submitted", ball_in_court: "EOR" },
    ];
    // Void is filtered → s2 (OFA) wins.
    expect(derivedSetStage(subs, [])).toBe("OFA");
  });

  it("returns Not Started when neither submittals nor sheets give a signal", () => {
    expect(derivedSetStage([], [])).toBe("Not Started");
    expect(derivedSetStage(null, null)).toBe("Not Started");
  });

  it("respects approved_date — Approved + date should bucket to Released", () => {
    const subs = [
      { id: "s1", submitted_date: "2025-04-01", status: "Approved", approved_date: "2025-04-05" },
    ];
    expect(derivedSetStage(subs, [])).toBe("Released");
  });
});

describe("isStageInReview", () => {
  it("flags OFA / BFA / OFS / BFS / FFF as in-review", () => {
    for (const s of ["OFA", "BFA", "OFS", "BFS", "FFF"]) {
      expect(isStageInReview(s)).toBe(true);
    }
  });
  it("excludes Not Started and Released", () => {
    expect(isStageInReview("Not Started")).toBe(false);
    expect(isStageInReview("Released")).toBe(false);
  });
});
