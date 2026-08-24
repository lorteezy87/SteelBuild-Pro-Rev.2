import { describe, expect, it } from "vitest";
import { filterRfiRecordsByKind, withRfiRecordKind } from "../rfiRecordKind";

const mixedRecords = [
  { id: "legacy-rfi", title: "Legacy RFI", metadata: {} },
  { id: "typed-rfi", title: "Typed RFI", metadata: { record_kind: "rfi" } },
  { id: "detail-query", title: "Detail Query", metadata: { record_kind: "detail_query" } },
];

describe("RFI record-kind separation", () => {
  it("keeps legacy and typed RFIs out of the Detail Queries register", () => {
    expect(filterRfiRecordsByKind(mixedRecords, "rfi").map((record) => record.id))
      .toEqual(["legacy-rfi", "typed-rfi"]);
  });

  it("shows only explicitly marked Detail Queries in their register", () => {
    expect(filterRfiRecordsByKind(mixedRecords, "detail_query").map((record) => record.id))
      .toEqual(["detail-query"]);
  });

  it("marks a new Detail Query without discarding existing metadata", () => {
    expect(withRfiRecordKind({ title: "Confirm connection", metadata: { rfi_type: "Design" } }, "detail_query"))
      .toEqual({
        title: "Confirm connection",
        metadata: { rfi_type: "Design", record_kind: "detail_query" },
      });
  });
});
