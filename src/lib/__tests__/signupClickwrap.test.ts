import { describe, expect, it } from "vitest";
import { assertTermsAccepted, TERMS_VERSION } from "../signupClickwrap";

describe("assertTermsAccepted", () => {
  it("throws when clickwrap was not affirmed", () => {
    expect(() => assertTermsAccepted(undefined)).toThrow(/Terms of Service/);
    expect(() => assertTermsAccepted(false)).toThrow(/Privacy Policy/);
  });

  it("passes when clickwrap was affirmed", () => {
    expect(() => assertTermsAccepted(true)).not.toThrow();
  });

  it("pins a stable terms version string for acceptance metadata", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
