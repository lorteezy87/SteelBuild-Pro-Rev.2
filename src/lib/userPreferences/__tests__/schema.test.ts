import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
} from "../schema";

describe("sanitizeUserPreferences", () => {
  it("fills defaults and normalizes malformed preference values", () => {
    const result = sanitizeUserPreferences({
      theme: "neon",
      table_density: "compact",
      pinned_modules: ["RFIs", 42, "RFIs", "Drawings"],
      favorite_project_ids: "project-1",
      auto_refresh_secs: -30,
    });

    expect(result.theme).toBe(DEFAULT_USER_PREFERENCES.theme);
    expect(result.table_density).toBe("compact");
    expect(result.pinned_modules).toEqual(["RFIs", "DrawingSubmittalHub"]);
    expect(result.favorite_project_ids).toEqual([]);
    expect(result.auto_refresh_secs).toBe(0);
    expect(result.preferences_version).toBe(2);
  });

  it("never returns identity or privilege-bearing input keys", () => {
    const result = sanitizeUserPreferences({
      role: "admin",
      permissions: ["*"],
      email: "attacker@example.com",
      org_id: "other-org",
      theme: "light",
    }) as unknown as Record<string, unknown>;

    expect(result.theme).toBe("light");
    expect(result.role).toBeUndefined();
    expect(result.permissions).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.org_id).toBeUndefined();
  });

  it("keeps supported legacy settings while dropping unknown keys", () => {
    const result = sanitizeUserPreferences({
      date_format: "YYYY-MM-DD",
      week_start: "monday",
      notify_rfi_overdue: false,
      made_up_setting: true,
    }) as unknown as Record<string, unknown>;

    expect(result.date_format).toBe("YYYY-MM-DD");
    expect(result.week_start).toBe("monday");
    expect(result.notify_rfi_overdue).toBe(false);
    expect(result.made_up_setting).toBeUndefined();
  });

  it("falls back safely when a landing page is not supported", () => {
    expect(sanitizeUserPreferences({ default_landing: "NotARealRoute" }).default_landing).toBe("Dashboard");
    expect(sanitizeUserPreferences({ default_landing: "PieceRegister" }).default_landing).toBe("PieceRegister");
  });
});
