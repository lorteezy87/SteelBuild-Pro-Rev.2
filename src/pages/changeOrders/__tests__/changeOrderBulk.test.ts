import { describe, expect, it } from "vitest";
import {
  buildApprovedPatch,
  buildSubmittedPatch,
  reconcileSelectedIds,
  summarizeBulkResult,
} from "../changeOrderBulk";

describe("change order bulk transitions", () => {
  it("builds a submitted patch without changing unrelated fields", () => {
    expect(buildSubmittedPatch("2026-07-14")).toEqual({
      status: "Submitted",
      submitted_date: "2026-07-14",
    });
  });

  it("builds an approval patch with the approver identity", () => {
    expect(buildApprovedPatch("2026-07-14", "Nicholas")).toEqual({
      status: "Approved",
      approved_date: "2026-07-14",
      approved_by: "Nicholas",
    });
  });

  it("fails closed when approval identity is missing", () => {
    expect(() => buildApprovedPatch("2026-07-14", "")).toThrow("approvedBy is required");
  });

  it("keeps only visible selected rows and removes successful rows", () => {
    expect(
      reconcileSelectedIds(
        new Set(["visible-success", "visible-failed", "hidden"]),
        ["visible-success", "visible-failed"],
        ["visible-success"],
      ),
    ).toEqual(new Set(["visible-failed"]));
  });

  it("reports complete success", () => {
    expect(summarizeBulkResult("approve", 2, 2, 0)).toEqual({
      level: "success",
      message: "Approved 2 change orders",
    });
  });

  it("reports partial failure without claiming all rows succeeded", () => {
    expect(summarizeBulkResult("submit", 3, 2, 1)).toEqual({
      level: "warning",
      message: "Submitted 2 of 3 change orders - 1 failed",
    });
  });

  it("reports total failure as an error", () => {
    expect(summarizeBulkResult("delete", 1, 0, 1)).toEqual({
      level: "error",
      message: "Failed to delete 1 change order",
    });
  });
});
