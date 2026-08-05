import { describe, expect, it } from "vitest";
import {
  COMMAND_CENTER_EMPTY_LIST,
  COMMAND_CENTER_STALE_TIME_MS,
} from "../commandCenterPageHelpers";

describe("commandCenterPageHelpers", () => {
  it("exports stable query defaults", () => {
    expect(COMMAND_CENTER_STALE_TIME_MS).toBe(60_000);
    expect(COMMAND_CENTER_EMPTY_LIST).toEqual([]);
    expect(Object.isFrozen(COMMAND_CENTER_EMPTY_LIST)).toBe(true);
  });
});
