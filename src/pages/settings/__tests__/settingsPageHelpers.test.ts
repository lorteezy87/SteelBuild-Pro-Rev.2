import { describe, expect, it } from "vitest";
import {
  filterVisibleSettingsGroups,
  countVisibleSettingsTabs,
  mergeUserPrefs,
} from "../settingsPageHelpers";

describe("settingsPageHelpers", () => {
  it("filters admin tabs and counts", () => {
    const groups = [
      { tabs: [{ id: "profile", label: "P" }, { id: "setup", label: "S", adminOnly: true }] },
      { adminOnly: true, tabs: [{ id: "system", label: "Sys" }] },
    ];
    const member = filterVisibleSettingsGroups(groups, false);
    expect(member).toHaveLength(1);
    expect(member[0].tabs.map((t) => t.id)).toEqual(["profile"]);
    const admin = filterVisibleSettingsGroups(groups, true);
    expect(countVisibleSettingsTabs(admin)).toBe(3);
    expect(mergeUserPrefs({ a: 1 }, { b: 2 } as any)).toEqual({ a: 1, b: 2 });
  });
});
