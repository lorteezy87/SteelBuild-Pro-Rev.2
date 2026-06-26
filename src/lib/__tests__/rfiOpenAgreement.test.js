import { describe, it, expect } from "vitest";
import { isRfiOpen } from "@/lib/entityPredicates";

describe("isRfiOpen — canonical open-RFI definition", () => {
  it("treats Open / Under Review / Incomplete Response as OPEN", () => {
    expect(isRfiOpen({ status: "Open" })).toBe(true);
    expect(isRfiOpen({ status: "Under Review" })).toBe(true);
    expect(isRfiOpen({ status: "Incomplete Response" })).toBe(true);
  });
  it("treats Answered / Closed / Void as CLOSED", () => {
    expect(isRfiOpen({ status: "Answered" })).toBe(false);
    expect(isRfiOpen({ status: "Closed" })).toBe(false);
    expect(isRfiOpen({ status: "Void" })).toBe(false);
  });
  it("treats unknown/empty status as open (conservative)", () => {
    expect(isRfiOpen({ status: "" })).toBe(true);
    expect(isRfiOpen({})).toBe(true);
  });
});
