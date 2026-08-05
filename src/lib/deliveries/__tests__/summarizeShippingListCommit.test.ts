import { describe, expect, it } from "vitest";
import { summarizeShippingListCommit } from "../summarizeShippingListCommit";

describe("summarizeShippingListCommit", () => {
  it("returns success when deliveries import and piece sync succeed", () => {
    const out = summarizeShippingListCommit({
      created: 2,
      items: 10,
      failed: 0,
      shipped: 10,
      canonicalShipped: 8,
      canonicalSkipped: 2,
    });
    expect(out.level).toBe("success");
    expect(out.message).toContain("2 loads imported");
    expect(out.message).toContain("8 canonical lots shipped");
    expect(out.message).toContain("2 canonical lots skipped");
  });

  it("returns warning when production or canonical bridge fails", () => {
    const out = summarizeShippingListCommit({
      created: 1,
      items: 4,
      failed: 0,
      shipped: 0,
      canonicalShipped: 0,
      canonicalSkipped: 0,
      productionShipFailed: true,
      canonicalShipFailed: true,
    });
    expect(out.level).toBe("warning");
    expect(out.message).toContain("Piece sync incomplete");
    expect(out.message).toContain("production status update failed");
    expect(out.message).toContain("canonical lot bridge failed");
  });
});
