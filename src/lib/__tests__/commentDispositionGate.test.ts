import { describe, expect, it } from "vitest";
import {
  COMMENT_DISPOSITION_STATUSES,
  RESOLVED_DISPOSITION_STATUSES,
  collectUnresolvedRequiredComments,
  evaluateCommentDispositionGate,
  formatUnresolvedCommentNotes,
  isDispositionResolved,
} from "@/lib/commentDispositionGate";

describe("comment disposition statuses", () => {
  it("lists the eight product statuses", () => {
    expect([...COMMENT_DISPOSITION_STATUSES]).toEqual([
      "Unreviewed",
      "Accepted",
      "Incorporated",
      "Clarification Required",
      "RFI Required",
      "Not Applicable",
      "Disputed",
      "Complete",
    ]);
  });

  it("treats Complete / Not Applicable / Incorporated as resolved", () => {
    expect([...RESOLVED_DISPOSITION_STATUSES].sort()).toEqual(
      ["Complete", "Incorporated", "Not Applicable"].sort(),
    );
    expect(isDispositionResolved("Complete")).toBe(true);
    expect(isDispositionResolved("Unreviewed")).toBe(false);
    expect(isDispositionResolved("Accepted")).toBe(false);
  });
});

describe("collectUnresolvedRequiredComments", () => {
  it("returns only required unresolved rows", () => {
    const open = collectUnresolvedRequiredComments([
      { id: "1", comment_number: "C1", status: "Unreviewed", is_required: true, comment_text: "Fix weld" },
      { id: "2", comment_number: "C2", status: "Complete", is_required: true, comment_text: "Done" },
      { id: "3", comment_number: "C3", status: "Unreviewed", is_required: false, comment_text: "Nice-to-have" },
      { id: "4", comment_number: "C4", status: "Incorporated", is_required: true, comment_text: "In cloud" },
    ]);
    expect(open.map((c) => c.id)).toEqual(["1"]);
  });

  it("ignores soft-deleted rows", () => {
    const open = collectUnresolvedRequiredComments([
      { id: "1", status: "Unreviewed", is_required: true, is_deleted: true },
    ]);
    expect(open).toEqual([]);
  });
});

describe("evaluateCommentDispositionGate", () => {
  const open = [
    { id: "1", comment_number: "C1", status: "Unreviewed", is_required: true, comment_text: "Revise bolt" },
  ];

  it("allows non-gated moves", () => {
    expect(
      evaluateCommentDispositionGate({
        kind: "ofs_to_ifc",
        dispositions: open,
        nextStage: "OFS",
      }).ok,
    ).toBe(true);
  });

  it("blocks OFS→IFC when required comments are unresolved", () => {
    const r = evaluateCommentDispositionGate({
      kind: "ofs_to_ifc",
      dispositions: open,
      nextStage: "IFC",
      priorStage: "OFS",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toMatch(/^COMMENT_DISPOSITION_BLOCKED:/);
      expect(r.unresolvedCount).toBe(1);
    }
  });

  it("allows OFS→IFC when all required comments are resolved", () => {
    const r = evaluateCommentDispositionGate({
      kind: "ofs_to_ifc",
      dispositions: [{ id: "1", status: "Complete", is_required: true }],
      nextStage: "IFC",
      priorStage: "OFS",
    });
    expect(r.ok).toBe(true);
  });

  it("allows OFS→IFC with audited override", () => {
    const r = evaluateCommentDispositionGate({
      kind: "ofs_to_ifc",
      dispositions: open,
      nextStage: "IFC",
      priorStage: "OFS",
      overrideReason: "PM accepted residual risk",
    });
    expect(r.ok).toBe(true);
  });

  it("blocks R&R→OFA when required comments are unresolved", () => {
    const r = evaluateCommentDispositionGate({
      kind: "rr_to_ofa",
      dispositions: open,
      nextStatus: "Submitted",
      priorStatus: "Revise and Resubmit",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/^COMMENT_DISPOSITION_BLOCKED:/);
  });

  it("allows R&R→OFA with override when comments remain open", () => {
    const r = evaluateCommentDispositionGate({
      kind: "rr_to_ofa",
      dispositions: open,
      nextStatus: "Submitted",
      priorStatus: "Revise and Resubmit",
      overrideReason: "Exception — comments tracked in RFI-012",
    });
    expect(r.ok).toBe(true);
  });
});

describe("formatUnresolvedCommentNotes", () => {
  it("formats a carry-forward style checklist", () => {
    const text = formatUnresolvedCommentNotes([
      { comment_number: "C1", location: "S-201", comment_text: "Fix weld", status: "Unreviewed" },
    ]);
    expect(text).toMatch(/C1/);
    expect(text).toMatch(/Fix weld/);
  });
});
