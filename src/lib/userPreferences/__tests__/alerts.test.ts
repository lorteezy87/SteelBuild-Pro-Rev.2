import { describe, expect, it } from "vitest";
import { filterAlertsForUser, isQuietHoursActive } from "../alerts";
import { sanitizeUserPreferences } from "../schema";

const alert = (alert_type: string, severity = "medium") => ({ id: alert_type, alert_type, severity });

describe("personalized in-app alerts", () => {
  it("filters known alert categories and leaves unknown alerts visible", () => {
    const prefs = sanitizeUserPreferences({ notify_rfi_overdue: false, notify_delivery_late: false });
    const result = filterAlertsForUser([
      alert("RFI Overdue", "high"),
      alert("Delivery Late", "high"),
      alert("Custom Coordination Alert"),
    ], prefs, new Date(2026, 7, 8, 12));

    expect(result.map((item) => item.alert_type)).toEqual(["Custom Coordination Alert"]);
  });

  it("handles quiet hours that cross midnight", () => {
    const prefs = sanitizeUserPreferences({ quiet_hours_enabled: true, quiet_hours_start: "18:00", quiet_hours_end: "07:00" });
    expect(isQuietHoursActive(new Date(2026, 7, 8, 22), prefs)).toBe(true);
    expect(isQuietHoursActive(new Date(2026, 7, 9, 6, 59), prefs)).toBe(true);
    expect(isQuietHoursActive(new Date(2026, 7, 9, 12), prefs)).toBe(false);
  });

  it("allows urgent alerts through quiet hours only when override is enabled", () => {
    const base = { quiet_hours_enabled: true, quiet_hours_start: "18:00", quiet_hours_end: "07:00" };
    const now = new Date(2026, 7, 8, 22);
    expect(filterAlertsForUser([alert("RFI Overdue", "critical")], sanitizeUserPreferences({ ...base, quiet_hours_urgent_override: true }), now)).toHaveLength(1);
    expect(filterAlertsForUser([alert("RFI Overdue", "critical")], sanitizeUserPreferences({ ...base, quiet_hours_urgent_override: false }), now)).toHaveLength(0);
  });
});
