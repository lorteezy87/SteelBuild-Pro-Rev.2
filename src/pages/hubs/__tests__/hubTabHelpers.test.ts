import { describe, expect, it } from "vitest";
import { resolveHubTabKey } from "../hubTabHelpers";

describe("hubTabHelpers", () => {
  it("resolves tab keys", () => {
    expect(resolveHubTabKey("lookahead", ["schedule", "lookahead"], "schedule")).toBe("lookahead");
    expect(resolveHubTabKey("nope", ["schedule", "lookahead"], "schedule")).toBe("schedule");
    expect(resolveHubTabKey(null, ["register", "schedule"], "register")).toBe("register");
  });
});
