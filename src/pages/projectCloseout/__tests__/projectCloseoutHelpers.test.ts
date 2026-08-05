import { describe, expect, it } from "vitest";
import {
  PROJECT_CLOSEOUT_COMMAND_SUBTITLE,
  PROJECT_CLOSEOUT_TABS,
  isProjectCloseoutTabId,
  replaceCloseoutInList,
  replaceCloseoutWithServerRow,
} from "../projectCloseoutHelpers";

describe("projectCloseoutHelpers", () => {
  it("tabs and subtitle", () => {
    expect(PROJECT_CLOSEOUT_TABS.map((t) => t.id)).toEqual([
      "checklist",
      "summary",
      "lessons",
    ]);
    expect(PROJECT_CLOSEOUT_COMMAND_SUBTITLE).toContain("Handover");
    expect(isProjectCloseoutTabId("summary")).toBe(true);
    expect(isProjectCloseoutTabId("x")).toBe(false);
  });

  it("list mutators", () => {
    const list = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
    expect(replaceCloseoutInList(list, "a", { n: 9 })).toEqual([
      { id: "a", n: 9 },
      { id: "b", n: 2 },
    ]);
    expect(replaceCloseoutWithServerRow(list, { id: "b", n: 5 })).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 5 },
    ]);
  });
});
