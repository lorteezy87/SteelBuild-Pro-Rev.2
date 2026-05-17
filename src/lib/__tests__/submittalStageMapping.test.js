import { describe, it, expect } from "vitest";
import {
  submittalStatusToStage,
  stageToSubmittalStatus,
  isRRStatus,
  pickMostRecentSubmittal,
  derivedSetStage,
  dominantStage,
  isStageInReview,
} from "@/lib/submittalStageMapping";

describe("submittalStatusToStage", () => {
  describe("Draft", () => {
    it("maps Draft → IFA regardless of bic", () => {
      expect(submittalStatusToStage("Draft", null, null)).toBe("IFA");
      expect(submittalStatusToStage("Draft", "Detailer", null)).toBe("IFA");
      expect(submittalStatusToStage("Draft", "EOR", null)).toBe("IFA");
    });
  });

  describe("Submitted / Under Review", () => {
    it("maps to IFA when bic is Detailer-class", () => {
      expect(submittalStatusToStage("Submitted",   "Detailer",   null)).toBe("IFA");
      expect(submittalStatusToStage("Submitted",   "S&H",        null)).toBe("IFA");
      expect(submittalStatusToStage("Submitted",   "Contractor", null)).toBe("IFA");
      expect(submittalStatusToStage("Under Review","Detailer",   null)).toBe("IFA");
    });

    it("maps to OFA when bic is Approver-class or Downstream-class", () => {
      expect(submittalStatusToStage("Submitted",   "EOR",       null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "Architect", null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "AOR",       null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "GC",        null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "Owner",     null)).toBe("OFA");
      expect(submittalStatusToStage("Under Review","EOR",       null)).toBe("OFA");
    });

    it("defaults to OFA when bic is missing or unknown", () => {
      expect(submittalStatusToStage("Submitted",   null,        null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "",          null)).toBe("OFA");
      expect(submittalStatusToStage("Submitted",   "Stranger",  null)).toBe("OFA");
    });
  });

  describe("Approved / Approved as Noted", () => {
    it("maps to BFA when bic is Approver-class", () => {
      expect(submittalStatusToStage("Approved",          "EOR",       null)).toBe("BFA");
      expect(submittalStatusToStage("Approved",          "Architect", null)).toBe("BFA");
      expect(submittalStatusToStage("Approved",          "AOR",       null)).toBe("BFA");
      expect(submittalStatusToStage("Approved as Noted", "EOR",       null)).toBe("BFA");
    });

    it("maps to OFS when bic is Detailer-class (post-approval scrub)", () => {
      expect(submittalStatusToStage("Approved",          "Detailer",   null)).toBe("OFS");
      expect(submittalStatusToStage("Approved",          "S&H",        null)).toBe("OFS");
      expect(submittalStatusToStage("Approved",          "Contractor", null)).toBe("OFS");
      expect(submittalStatusToStage("Approved as Noted", "Detailer",   null)).toBe("OFS");
    });

    it("maps to IFC when bic is Downstream-class (record copy to GC)", () => {
      expect(submittalStatusToStage("Approved",          "GC",     null)).toBe("IFC");
      expect(submittalStatusToStage("Approved",          "Owner",  null)).toBe("IFC");
      expect(submittalStatusToStage("Approved as Noted", "GC",     null)).toBe("IFC");
    });

    it("defaults to BFA when bic is missing/unknown (just-returned, not yet routed)", () => {
      expect(submittalStatusToStage("Approved",          null,    null)).toBe("BFA");
      expect(submittalStatusToStage("Approved as Noted", "",      null)).toBe("BFA");
      expect(submittalStatusToStage("Approved",          "Random",null)).toBe("BFA");
    });
  });

  describe("R&R outcomes", () => {
    it("maps Revise and Resubmit / Rejected → IFA (loop back)", () => {
      expect(submittalStatusToStage("Revise and Resubmit", null,       null)).toBe("IFA");
      expect(submittalStatusToStage("Revise and Resubmit", "Detailer", null)).toBe("IFA");
      expect(submittalStatusToStage("Rejected",             "EOR",     null)).toBe("IFA");
    });
  });

  describe("Released for Fabrication", () => {
    it("maps to Released regardless of bic", () => {
      expect(submittalStatusToStage("Released for Fabrication", null,       null)).toBe("Released");
      expect(submittalStatusToStage("Released for Fabrication", "Detailer", null)).toBe("Released");
    });
  });

  describe("Void / unknown / null", () => {
    it("returns null", () => {
      expect(submittalStatusToStage("Void", null, null)).toBeNull();
      expect(submittalStatusToStage(null, null, null)).toBeNull();
      expect(submittalStatusToStage("", null, null)).toBeNull();
      expect(submittalStatusToStage("Unknown Status", null, null)).toBeNull();
    });
  });
});

describe("stageToSubmittalStatus", () => {
  it("maps every stage in STAGE_ORDER to a (status, bic) shape", () => {
    expect(stageToSubmittalStatus("Not Started")).toBeNull();
    expect(stageToSubmittalStatus("IFA")).toMatchObject({ status: "Draft",                    ball_in_court: "Detailer" });
    expect(stageToSubmittalStatus("OFA")).toMatchObject({ status: "Submitted",                ball_in_court: "EOR" });
    expect(stageToSubmittalStatus("BFA")).toMatchObject({ status: "Approved as Noted",        ball_in_court: "EOR" });
    expect(stageToSubmittalStatus("OFS")).toMatchObject({ status: "Approved as Noted",        ball_in_court: "Detailer" });
    expect(stageToSubmittalStatus("IFC")).toMatchObject({ status: "Approved",                 ball_in_court: "GC" });
    expect(stageToSubmittalStatus("Released")).toMatchObject({ status: "Released for Fabrication", ball_in_court: null });
  });

  it("returns null for unknown stages", () => {
    expect(stageToSubmittalStatus("BFS")).toBeNull(); // dropped stage
    expect(stageToSubmittalStatus("FFF")).toBeNull(); // dropped stage
    expect(stageToSubmittalStatus("Bogus")).toBeNull();
    expect(stageToSubmittalStatus(null)).toBeNull();
  });
});

describe("isRRStatus", () => {
  it("matches Revise and Resubmit + Rejected", () => {
    expect(isRRStatus("Revise and Resubmit")).toBe(true);
    expect(isRRStatus("Rejected")).toBe(true);
  });
  it("does not match other statuses", () => {
    expect(isRRStatus("Approved")).toBe(false);
    expect(isRRStatus("Approved as Noted")).toBe(false);
    expect(isRRStatus("Submitted")).toBe(false);
    expect(isRRStatus(null)).toBe(false);
  });
});

describe("dominantStage", () => {
  it("picks the most-frequent stage", () => {
    expect(dominantStage(["IFA", "IFA", "OFA"])).toBe("IFA");
    expect(dominantStage(["OFS", "OFS", "OFS"])).toBe("OFS");
  });

  it("breaks ties by canonical order (earliest in STAGE_ORDER wins)", () => {
    expect(dominantStage(["IFA", "OFA"])).toBe("IFA");
    expect(dominantStage(["BFA", "OFA"])).toBe("OFA");
  });

  it("ignores unknown / dropped stages (BFS, FFF) and falsy entries", () => {
    expect(dominantStage(["BFS", "FFF", null, undefined, "OFA"])).toBe("OFA");
    expect(dominantStage(["BFS", "FFF"])).toBe("Not Started");
  });

  it("returns Not Started for empty / non-array input", () => {
    expect(dominantStage([])).toBe("Not Started");
    expect(dominantStage(null)).toBe("Not Started");
    expect(dominantStage(undefined)).toBe("Not Started");
  });
});

describe("pickMostRecentSubmittal", () => {
  it("orders by submitted_date desc", () => {
    const subs = [
      { id: "a", submitted_date: "2026-01-01" },
      { id: "b", submitted_date: "2026-03-01" },
      { id: "c", submitted_date: "2026-02-01" },
    ];
    expect(pickMostRecentSubmittal(subs).id).toBe("b");
  });

  it("falls back to updated_at then round_number when submitted_date ties", () => {
    const subs = [
      { id: "a", submitted_date: "2026-02-01", updated_at: "2026-02-01T08:00Z", round_number: 1 },
      { id: "b", submitted_date: "2026-02-01", updated_at: "2026-02-01T12:00Z", round_number: 1 },
    ];
    expect(pickMostRecentSubmittal(subs).id).toBe("b");
  });

  it("filters out soft-deleted rows", () => {
    const subs = [
      { id: "a", submitted_date: "2026-03-01", is_deleted: true },
      { id: "b", submitted_date: "2026-01-01" },
    ];
    expect(pickMostRecentSubmittal(subs).id).toBe("b");
  });

  it("returns null on empty / null / no active rows", () => {
    expect(pickMostRecentSubmittal([])).toBeNull();
    expect(pickMostRecentSubmittal(null)).toBeNull();
    expect(pickMostRecentSubmittal([{ id: "a", is_deleted: true }])).toBeNull();
  });
});

describe("derivedSetStage", () => {
  it("uses the most-recent submittal's stage when active submittals exist", () => {
    const subs = [
      { id: "s1", submitted_date: "2026-04-01", status: "Approved", ball_in_court: "Detailer" },
      { id: "s2", submitted_date: "2026-03-01", status: "Submitted", ball_in_court: "EOR" },
    ];
    expect(derivedSetStage(subs, [])).toBe("OFS");
  });

  it("skips Voided submittals when picking most-recent", () => {
    const subs = [
      { id: "s1", submitted_date: "2026-05-01", status: "Void" },
      { id: "s2", submitted_date: "2026-03-01", status: "Submitted", ball_in_court: "EOR" },
    ];
    expect(derivedSetStage(subs, [])).toBe("OFA");
  });

  it("falls back to dominant sheet stage when no submittals exist", () => {
    const sheets = [{ stage: "OFA" }, { stage: "OFA" }, { stage: "IFA" }];
    expect(derivedSetStage([], sheets)).toBe("OFA");
  });

  it("returns Not Started when neither submittals nor sheets give a signal", () => {
    expect(derivedSetStage([], [])).toBe("Not Started");
    expect(derivedSetStage(null, null)).toBe("Not Started");
  });
});

describe("isStageInReview", () => {
  it("is true for IFA/OFA/BFA/OFS/IFC", () => {
    for (const s of ["IFA", "OFA", "BFA", "OFS", "IFC"]) {
      expect(isStageInReview(s)).toBe(true);
    }
  });
  it("is false for Not Started and Released", () => {
    expect(isStageInReview("Not Started")).toBe(false);
    expect(isStageInReview("Released")).toBe(false);
  });
  it("is false for dropped legacy stages (BFS, FFF)", () => {
    expect(isStageInReview("BFS")).toBe(false);
    expect(isStageInReview("FFF")).toBe(false);
  });
});
