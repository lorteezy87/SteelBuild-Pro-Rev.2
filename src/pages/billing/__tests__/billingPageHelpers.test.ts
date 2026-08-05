import { describe, expect, it } from "vitest";
import { countPendingInvites } from "../billingPageHelpers";

describe("billingPageHelpers", () => {
  it("counts pending invites", () => {
    expect(
      countPendingInvites([
        { status: "pending" },
        { status: "accepted" },
        { status: "pending" },
      ]),
    ).toBe(2);
  });
});
