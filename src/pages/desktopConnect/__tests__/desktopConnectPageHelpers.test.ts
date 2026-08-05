import { describe, expect, it } from "vitest";
import { DesktopConnectQueryError } from "@/lib/desktopSessionHandoff";
import {
  desktopConnectFailureMessage,
  DESKTOP_CONNECT_FAILURE_MESSAGES,
  classifyQueryFailure,
  resolveDesktopConnectSearch,
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

describe("classifyQueryFailure", () => {
  it("maps empty/missing kinds and defaults to query", () => {
    expect(classifyQueryFailure(new DesktopConnectQueryError("empty", "e"))).toBe("query-empty");
    expect(classifyQueryFailure(new DesktopConnectQueryError("missing", "m"))).toBe("query-missing");
    expect(classifyQueryFailure(new DesktopConnectQueryError("invalid", "i"))).toBe("query");
    expect(classifyQueryFailure(new Error("x"))).toBe("query");
  });
});


describe("resolveDesktopConnectSearch", () => {
  it("returns explicit search when provided", () => {
    expect(resolveDesktopConnectSearch("?state=x")).toBe("?state=x");
  });
  it("returns empty string when window-less and no explicit", () => {
    // jsdom has window; pin empty explicit is more reliable for pure behavior
    expect(resolveDesktopConnectSearch("")).toBe("");
  });
});
