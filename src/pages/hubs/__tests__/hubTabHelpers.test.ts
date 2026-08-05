import { describe, expect, it } from "vitest";
import {
  resolveHubTabKey,
  nextHubTabParams,
  nextSearchParamsWithout,
  nextSearchParamsPatch,
} from "../hubTabHelpers";

describe("hubTabHelpers", () => {
  it("resolves tab keys", () => {
    expect(resolveHubTabKey("lookahead", ["schedule", "lookahead"], "schedule")).toBe("lookahead");
    expect(resolveHubTabKey("nope", ["schedule", "lookahead"], "schedule")).toBe("schedule");
    expect(resolveHubTabKey(null, ["register", "schedule"], "register")).toBe("register");
  });

  it("nextHubTabParams sets the tab key", () => {
    const next = nextHubTabParams("foo=1", "proj_tab", "contacts");
    expect(next.get("proj_tab")).toBe("contacts");
    expect(next.get("foo")).toBe("1");
  });

  it("nextSearchParamsWithout drops listed keys", () => {
    const next = nextSearchParamsWithout("fromRfi=abc&keep=1", ["fromRfi"]);
    expect(next.get("fromRfi")).toBeNull();
    expect(next.get("keep")).toBe("1");
  });

  it("nextSearchParamsPatch sets and deletes", () => {
    const next = nextSearchParamsPatch("status=open&project=p1", {
      status: "all",
      project: null,
      receive: "1",
    });
    expect(next.get("status")).toBe("all");
    expect(next.get("project")).toBeNull();
    expect(next.get("receive")).toBe("1");
  });
});
