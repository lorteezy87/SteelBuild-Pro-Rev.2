import { describe, expect, it } from "vitest";
import { buildConstraintPrefillFromRfi } from "../rfiConstraintHandoff";

describe("buildConstraintPrefillFromRfi", () => {
  it("prefills title, description, and meeting reference from the RFI", () => {
    expect(
      buildConstraintPrefillFromRfi(
        {
          id: "r1",
          rfi_number: "RFI-12",
          title: "Clarify weld detail",
          question: "Is fillet OK?",
          assigned_to: "EOR",
          due_date: "2026-08-01",
          project_id: "p-other",
        },
        "proj-1",
      ),
    ).toMatchObject({
      title: "RFI RFI-12: Clarify weld detail",
      description: "Is fillet OK?",
      meeting_reference: "RFI RFI-12",
      constraint_type: "Design",
      assigned_to: "EOR",
      due_date: "2026-08-01",
      project_id: "proj-1",
      priority: "High",
      status: "Open",
    });
  });

  it("falls back when number/title are missing", () => {
    const prefill = buildConstraintPrefillFromRfi({ subject: "Hold for info" });
    expect(prefill.title).toBe("RFI: Hold for info");
    expect(prefill.meeting_reference).toBe("RFI");
  });
});
