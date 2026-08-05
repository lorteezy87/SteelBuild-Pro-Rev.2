import { describe, expect, it } from "vitest";
import { BIC_CHOICES } from "../newRoundModalHelpers";

describe("BIC_CHOICES", () => {
  it("includes EOR", () => {
    expect(BIC_CHOICES).toContain("EOR");
  });
});
