import { describe, expect, it } from "vitest";
import {
  COMMAND_CENTER_EMPTY_LIST,
  COMMAND_CENTER_STALE_TIME_MS,
  buildCommandCenterProjectMap,
} from "../commandCenterPageHelpers";

describe("commandCenterPageHelpers", () => {
  it("exports stable query defaults", () => {
    expect(COMMAND_CENTER_STALE_TIME_MS).toBe(60_000);
    expect(COMMAND_CENTER_EMPTY_LIST).toEqual([]);
    expect(Object.isFrozen(COMMAND_CENTER_EMPTY_LIST)).toBe(true);
  });

  it("builds compact project map by id", () => {
    const m = buildCommandCenterProjectMap([
      { id: "p1", project_number: "1", name: "A", gc_name: "G" },
      { id: null as any, name: "skip" },
    ]);
    expect(m.p1).toEqual({ project_number: "1", name: "A", gc_name: "G" });
    expect(Object.keys(m)).toEqual(["p1"]);
  });
});
