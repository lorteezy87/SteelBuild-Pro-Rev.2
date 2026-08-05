import { describe, it, expect } from "vitest";
import {
  buildSettingsSummary,
  formatThemeLabel,
} from "../settingsControlCenter.derive";

describe("formatThemeLabel", () => {
  it("maps known theme keys to labels", () => {
    expect(formatThemeLabel("dark")).toBe("Dark");
    expect(formatThemeLabel("light")).toBe("Light");
    expect(formatThemeLabel("system")).toBe("System");
  });

  it("returns null for absent/empty theme", () => {
    expect(formatThemeLabel(null)).toBeNull();
    expect(formatThemeLabel(undefined)).toBeNull();
    expect(formatThemeLabel("")).toBeNull();
  });

  it("passes through an unrecognized theme value verbatim", () => {
    expect(formatThemeLabel("solarized")).toBe("solarized");
  });
});

describe("buildSettingsSummary", () => {
  it("returns Admin role label for admin users", () => {
    const s = buildSettingsSummary({ role: "admin" }, {}, 6);
    expect(s.roleLabel).toBe("Admin");
    expect(s.isAdmin).toBe(true);
  });

  it("returns Member role label for regular users", () => {
    const s = buildSettingsSummary({ role: "user" }, {}, 3);
    expect(s.roleLabel).toBe("Member");
    expect(s.isAdmin).toBe(false);
  });

  it("defaults to Member when role is absent", () => {
    const s = buildSettingsSummary(null, null, 3);
    expect(s.roleLabel).toBe("Member");
    expect(s.isAdmin).toBe(false);
  });

  it("passes through visibleSectionCount", () => {
    const s = buildSettingsSummary({ role: "user" }, {}, 5);
    expect(s.visibleSectionCount).toBe(5);
  });

  it("counts pinned modules when the array is present", () => {
    const s = buildSettingsSummary(
      { role: "user" },
      { pinned_modules: ["dashboard", "drawings", "rfis"] },
      3,
    );
    expect(s.pinnedModuleCount).toBe(3);
  });

  it("returns null pinnedModuleCount when pinned_modules is absent", () => {
    const s = buildSettingsSummary({ role: "user" }, {}, 3);
    expect(s.pinnedModuleCount).toBeNull();
  });

  it("returns themeLabel from prefs", () => {
    const s = buildSettingsSummary({ role: "user" }, { theme: "dark" }, 3);
    expect(s.themeLabel).toBe("Dark");
  });

  it("returns null themeLabel when theme pref is not stored", () => {
    const s = buildSettingsSummary({ role: "user" }, {}, 3);
    expect(s.themeLabel).toBeNull();
  });
});
