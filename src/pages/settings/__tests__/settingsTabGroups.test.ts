import { describe, expect, it } from "vitest";
import { TAB_GROUPS } from "../settingsTabGroups";

describe("TAB_GROUPS", () => {
  it("includes personal and admin groups", () => {
    expect(TAB_GROUPS.map((g) => g.id)).toEqual(
      expect.arrayContaining(["personal", "admin"]),
    );
    expect(TAB_GROUPS.find((g) => g.id === "admin")?.adminOnly).toBe(true);
  });
});
