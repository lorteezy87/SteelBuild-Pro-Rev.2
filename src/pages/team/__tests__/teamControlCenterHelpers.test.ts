import { describe, expect, it } from "vitest";
import { ROLE_LABEL, ROLE_OPTIONS, formatTeamRole } from "../teamControlCenterHelpers";

describe("teamControlCenterHelpers", () => {
  it("roles", () => {
    expect(ROLE_LABEL.admin).toBe("Admin");
    expect(ROLE_OPTIONS).toContain("member");
    expect(formatTeamRole("owner")).toBe("Owner");
  });
});
