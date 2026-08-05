import { describe, expect, it } from "vitest";
import { INITIAL_CONTACT_FORM } from "../contactFormModalHelpers";

describe("contactFormModalHelpers", () => {
  it("empty contact form", () => {
    expect(INITIAL_CONTACT_FORM.contact_type).toBe("GC");
    expect(INITIAL_CONTACT_FORM.first_name).toBe("");
    expect(Object.keys(INITIAL_CONTACT_FORM)).toContain("email");
  });
});
