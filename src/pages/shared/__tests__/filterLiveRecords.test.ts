import { describe, expect, it } from "vitest";
import { filterLiveRecords } from "../filterLiveRecords";

describe("filterLiveRecords", () => {
  it("drops soft-deleted rows and tolerates null input", () => {
    expect(
      filterLiveRecords([
        { id: "a" },
        { id: "b", is_deleted: true },
        { id: "c", is_deleted: false },
      ]).map((r) => r.id),
    ).toEqual(["a", "c"]);
    expect(filterLiveRecords(null)).toEqual([]);
    expect(filterLiveRecords(undefined)).toEqual([]);
  });
});
