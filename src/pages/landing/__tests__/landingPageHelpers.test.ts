import { describe, expect, it } from "vitest";
import {
  canSubmitCredentials,
  canSubmitEmailOnly,
  buildDemoPayload,
  isScrolledPast,
} from "../landingPageHelpers";

describe("landingPageHelpers", () => {
  it("form guards and demo payload", () => {
    expect(canSubmitCredentials(" a@b.com ", "x")).toBe(true);
    expect(canSubmitCredentials("  ", "x")).toBe(false);
    expect(canSubmitEmailOnly("a@b.com")).toBe(true);
    expect(
      buildDemoPayload({ name: " A ", email: " e@x.com ", company: "", tonnage: "50", message: " hi " }),
    ).toEqual({
      name: "A",
      email: "e@x.com",
      company: null,
      tonnage: "50",
      message: "hi",
    });
    expect(isScrolledPast(31)).toBe(true);
    expect(isScrolledPast(30)).toBe(false);
  });
});
