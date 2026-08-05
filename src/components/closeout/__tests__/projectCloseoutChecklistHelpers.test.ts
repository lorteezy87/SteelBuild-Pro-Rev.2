import { describe, expect, it } from "vitest";
import { CHECKLIST_ITEMS } from "../projectCloseoutChecklistHelpers";

describe("projectCloseoutChecklistHelpers", () => {
  it("six closeout checklist keys", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(6);
    expect(CHECKLIST_ITEMS.map((i) => i.key)).toContain("punch_list_cleared");
  });
});
