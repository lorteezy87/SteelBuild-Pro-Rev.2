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

  it("strips identity and privilege keys from imported preferences", () => {
    const parsed = parseUserPreferencesExport(JSON.stringify({
      version: 2,
      preferences: { theme: "dark", role: "admin", email: "x@example.com", permissions: ["*"] },
    }));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const record = parsed.preferences as unknown as Record<string, unknown>;
      expect(record.role).toBeUndefined();
      expect(record.email).toBeUndefined();
      expect(record.permissions).toBeUndefined();
    }
  });
});
