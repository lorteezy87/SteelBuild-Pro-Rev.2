import { describe, expect, it } from "vitest";
import { submittalWaitingOn } from "../submittalWaitingOn";

const typed = { submittal_type: "Shop Drawing" };

describe("submittalWaitingOn", () => {
  it("waits on the reviewer while out for approval", () => {
    expect(submittalWaitingOn({ ...typed, status: "Under Review", ball_in_court: "EOR", submitted_date: "2026-07-06" })).toEqual([
      { what: "Reviewer response", why: "Out for approval since 2026-07-06", owner: "EOR" },
    ]);
  });

  it("does not invent a sent date", () => {
    const [item] = submittalWaitingOn({ ...typed, status: "Submitted", ball_in_court: "GC" });
    expect(item.why).toBe("Out for approval; sent date not recorded");
  });

  it("waits on the resubmittal and unresolved required comments after R&R", () => {
    const items = submittalWaitingOn(
      { ...typed, status: "Revise and Resubmit", ball_in_court: "Detailer", returned_date: "2026-07-20" },
      {
        commentDispositions: [
          { status: "Unreviewed", is_required: true },
          { status: "Incorporated", is_required: true },
          { status: "Disputed", is_required: false },
          { status: "Accepted", is_required: true, is_deleted: true },
        ],
      },
    );
    expect(items).toEqual([
      { what: "Revised resubmittal", why: "Returned Revise and Resubmit on 2026-07-20", owner: "Detailer" },
      { what: "1 returned comment not incorporated", why: "Must be resolved before resubmitting", owner: "Detailer" },
    ]);
  });

  it("flags open comments during scrub as blocking IFC", () => {
    const items = submittalWaitingOn(
      { ...typed, status: "Approved as Noted", ball_in_court: "Detailer" },
      { commentDispositions: [{ status: "Clarification Required", is_required: true }, { status: "RFI Required" }] },
    );
    expect(items).toEqual([{ what: "2 returned comments not incorporated", why: "Blocks issue for construction", owner: "Detailer" }]);
  });

  it("lists only this submittal's own open linked RFIs", () => {
    const items = submittalWaitingOn(
      { ...typed, status: "Approved", ball_in_court: "Detailer", linked_rfi_ids: ["r1", "r2", "r3"] },
      {
        rfis: [
          { id: "r1", rfi_number: "014", subject: "Beam B12 elevation", status: "Open", ball_in_court: "EOR" },
          { id: "r2", rfi_number: "015", status: "Answered" },
          { id: "r3", rfi_number: null, status: "Under Review" },
          { id: "r9", rfi_number: "099", status: "Open" },
        ],
      },
    );
    expect(items).toEqual([
      { what: "RFI 014 open", why: "Beam B12 elevation", owner: "EOR" },
      { what: "Linked RFI open", why: "Linked RFI is not answered", owner: null },
    ]);
  });

  it("is empty once released, and flags an untyped record", () => {
    expect(submittalWaitingOn({ ...typed, status: "Released for Fabrication", linked_rfi_ids: ["r1"] }, { rfis: [{ id: "r1", status: "Open" }] })).toEqual([]);
    expect(submittalWaitingOn({ status: "Released for Fabrication" })[0].what).toBe("Submittal type");
    expect(submittalWaitingOn(null)).toEqual([]);
  });
});
