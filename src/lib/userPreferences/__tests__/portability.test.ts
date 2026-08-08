import { describe, expect, it } from "vitest";
import { parseUserPreferencesExport, serializeUserPreferences } from "../portability";
import { sanitizeUserPreferences } from "../schema";

describe("preference portability", () => {
  it("round-trips a versioned preference export", () => {
    const source = sanitizeUserPreferences({ theme: "light", pinned_modules: ["RFIs"] });
    const parsed = parseUserPreferencesExport(serializeUserPreferences(source));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.preferences.theme).toBe("light");
      expect(parsed.preferences.pinned_modules).toEqual(["RFIs"]);
      expect(parsed.preferences.preferences_version).toBe(2);
    }
  });

  it("rejects invalid JSON and unsupported versions without partial data", () => {
    expect(parseUserPreferencesExport("not-json")).toEqual({
      ok: false,
      error: "The selected file is not valid JSON.",
    });
    expect(parseUserPreferencesExport(JSON.stringify({ version: 99, preferences: {} }))).toEqual({
      ok: false,
      error: "This settings file uses an unsupported version.",
    });
  });

  it("rejects identity, privilege, and unknown keys instead of silently dropping them", () => {
    const valid = sanitizeUserPreferences({ theme: "dark" });
    const parsed = parseUserPreferencesExport(JSON.stringify({
      version: 2,
      preferences: { ...valid, role: "admin", email: "x@example.com", permissions: ["*"] },
    }));

    expect(parsed).toEqual({
      ok: false,
      error: "The settings file contains unsupported fields: email, permissions, role.",
    });
  });

  it("rejects partial or malformed preference payloads instead of applying defaults", () => {
    expect(parseUserPreferencesExport(JSON.stringify({
      version: 2,
      preferences: { theme: "dark" },
    }))).toMatchObject({ ok: false });

    const malformed = sanitizeUserPreferences({ theme: "dark" }) as unknown as Record<string, unknown>;
    malformed.table_density = "ultra-tight";
    expect(parseUserPreferencesExport(JSON.stringify({ version: 2, preferences: malformed }))).toEqual({
      ok: false,
      error: "The settings file contains an invalid value for table_density.",
    });
  });
});
