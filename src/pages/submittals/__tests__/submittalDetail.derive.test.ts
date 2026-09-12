import { describe, expect, it } from "vitest";
import {
  deriveNewRoundAction,
  deriveRelatedSetRfis,
  deriveSubmittalDetailSummary,
} from "../submittalDetail.derive";

describe("submittalDetail derivation", () => {
  it("keeps linked RFI UUIDs separate from drawing-set relationships", () => {
    const manualRfiId = "2ce79bca-6daf-4cdf-bb1a-581db9968290";
    const relatedRfiId = "bc24c6d1-28aa-456d-ab8c-378c866728af";
    const result = deriveRelatedSetRfis(
      {
        drawing_set_ids: ["set-a"],
        linked_rfi_ids: [manualRfiId],
      },
      [
        { id: manualRfiId, drawing_set_id: "set-a", rfi_number: "RFI #001" },
        { id: relatedRfiId, drawing_set_id: "set-a", rfi_number: "RFI #002" },
        { id: "other", drawing_set_id: "set-b", rfi_number: "RFI #003" },
      ],
    );

    expect(result).toEqual([
      { id: relatedRfiId, drawing_set_id: "set-a", rfi_number: "RFI #002" },
    ]);
  });

  it("does not mark closed approval dispositions overdue", () => {
    const summary = deriveSubmittalDetailSummary({
      status: "Approved as Noted",
      ball_in_court: "Detailer",
      required_date: "2000-01-01",
    });

    expect(summary.overdue).toBe(false);
    expect(summary.risk?.stage).toBe("OFS");
    expect(summary.risk?.tier).toBe("critical");
  });

  it("numbers resubmittals from the latest recorded round", () => {
    expect(
      deriveNewRoundAction(
        { status: "Revise and Resubmit", total_rounds: 8 },
        [{ round_number: 1 }, { round_number: 3 }],
      ),
    ).toEqual({
      isResubmit: true,
      label: "↻ Start Resubmittal — Round 4",
      helperText: "Carries the reviewer's open comments forward.",
    });
  });

  it("uses the submittal round count when no round records are loaded", () => {
    expect(
      deriveNewRoundAction({ status: "Draft", total_rounds: 2 }, []),
    ).toEqual({
      isResubmit: false,
      label: "+ New Round",
      helperText: null,
    });
  });
});
