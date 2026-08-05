import { describe, expect, it } from "vitest";
import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from "../legalMeta";

describe("legalMeta", () => {
  it("exposes contact emails and last-updated stamps", () => {
    expect(LEGAL_CONTACT.privacy).toContain("@");
    expect(LEGAL_CONTACT.support).toContain("@");
    expect(LEGAL_LAST_UPDATED.terms).toMatch(/\d{4}/);
    expect(LEGAL_LAST_UPDATED.subprocessors).toMatch(/\d{4}/);
  });
});
