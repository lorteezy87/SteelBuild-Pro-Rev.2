import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PREFERENCES } from "../schema";
import { buildPreferenceResetPatch, PREFERENCE_RESET_SECTIONS } from "../resetSections";

describe("preference section resets", () => {
  it("resets only keys in the selected section", () => {
    const patch = buildPreferenceResetPatch("appearance");

    expect(Object.keys(patch)).toEqual([...PREFERENCE_RESET_SECTIONS.appearance]);
    expect(patch.theme).toBe(DEFAULT_USER_PREFERENCES.theme);
    expect(patch.notify_alerts).toBeUndefined();
  });

  it("returns fresh array values for repeatable resets", () => {
    const first = buildPreferenceResetPatch("workspace");
    const second = buildPreferenceResetPatch("workspace");

    expect(first.pinned_modules).toEqual(DEFAULT_USER_PREFERENCES.pinned_modules);
    expect(first.pinned_modules).not.toBe(second.pinned_modules);
  });
});
