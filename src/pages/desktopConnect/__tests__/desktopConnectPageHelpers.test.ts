import { describe, expect, it } from "vitest";
import {
  desktopConnectFailureMessage,
  DESKTOP_CONNECT_FAILURE_MESSAGES,
} from "../desktopConnectPageHelpers";

describe("desktopConnectPageHelpers", () => {
  it("looks up failure messages", () => {
    expect(desktopConnectFailureMessage("session")).toBe(
      DESKTOP_CONNECT_FAILURE_MESSAGES.session,
    );
    expect(desktopConnectFailureMessage("crypto-import")).toContain("DC-CRYPTO-IMPORT");
    expect(desktopConnectFailureMessage("nope")).toBe(DESKTOP_CONNECT_FAILURE_MESSAGES.query);
    expect(desktopConnectFailureMessage(null)).toBe(DESKTOP_CONNECT_FAILURE_MESSAGES.query);
  });
});
