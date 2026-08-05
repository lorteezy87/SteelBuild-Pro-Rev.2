import { describe, expect, it } from "vitest";
import {
  parseInviteTokenFromSearch,
  isInviteInvalid,
  canSubmitWorkspaceName,
} from "../orgOnboardingPageHelpers";

describe("orgOnboardingPageHelpers", () => {
  it("parses invite and validity", () => {
    expect(parseInviteTokenFromSearch("?invite=abc")).toBe("abc");
    expect(parseInviteTokenFromSearch("")).toBeNull();
    expect(isInviteInvalid(null)).toBe(true);
    expect(isInviteInvalid({ status: "pending", expired: false })).toBe(false);
    expect(isInviteInvalid({ status: "accepted", expired: false })).toBe(true);
    expect(isInviteInvalid({ status: "pending", expired: true })).toBe(true);
    expect(canSubmitWorkspaceName(" Acme ", false)).toBe(true);
    expect(canSubmitWorkspaceName("  ", false)).toBe(false);
    expect(canSubmitWorkspaceName("Acme", true)).toBe(false);
  });
});
