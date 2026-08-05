import { describe, expect, it } from "vitest";
import { normalizeMfaCode, isMfaCodeReady } from "../mfaChallengeHelpers";

describe("mfaChallengeHelpers", () => {
  it("normalizes and validates", () => {
    expect(normalizeMfaCode("12 34 56")).toBe("123456");
    expect(isMfaCodeReady("12345")).toBe(false);
    expect(isMfaCodeReady("123456")).toBe(true);
    expect(isMfaCodeReady("12 34 56")).toBe(true);
  });
});
