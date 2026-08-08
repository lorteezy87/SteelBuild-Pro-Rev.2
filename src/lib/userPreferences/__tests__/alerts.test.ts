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

  it("uses personalized RFI and budget urgency thresholds during quiet hours", () => {
    const now = new Date(2026, 7, 8, 22);
    const prefs = sanitizeUserPreferences({
      quiet_hours_enabled: true,
      quiet_hours_start: "18:00",
      quiet_hours_end: "07:00",
      quiet_hours_urgent_override: true,
      rfi_overdue_threshold: 7,
      budget_alert_pct: 90,
    });

    const result = filterAlertsForUser([
      { ...alert("RFI Overdue", "high"), title: "RFI 101 overdue — 2d" },
      { ...alert("RFI Overdue", "high"), title: "RFI 102 overdue — 8d" },
      { ...alert("Budget Threshold", "high"), description: "Cost code is at 85%" },
      { ...alert("Budget Threshold", "high"), description: "Cost code is at 95%" },
    ], prefs, now);

    expect(result.map((item) => "title" in item ? item.title : item.description)).toEqual([
      "RFI 102 overdue — 8d",
      "Cost code is at 95%",
    ]);
  });

  it("uses the stale change-order threshold during quiet hours", () => {
    const now = new Date("2026-08-08T22:00:00.000Z");
    const prefs = sanitizeUserPreferences({
      quiet_hours_enabled: true,
      quiet_hours_start: "00:00",
      quiet_hours_end: "23:59",
      quiet_hours_urgent_override: true,
      co_stale_days: 30,
    });

    const result = filterAlertsForUser([
      { ...alert("Change Order Pending", "high"), title: "CO 10 pending", created_at: "2026-07-20T22:00:00.000Z" },
      { ...alert("Change Order Pending", "high"), title: "CO 11 pending", created_at: "2026-07-08T22:00:00.000Z" },
    ], prefs, now);

    expect(result.map((item) => item.title)).toEqual(["CO 11 pending"]);
  });
});
