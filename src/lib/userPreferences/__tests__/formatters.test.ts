import { beforeEach, describe, expect, it } from "vitest";
import {
  formatUserCurrency,
  formatUserDate,
  formatUserMeasurement,
  formatUserNumber,
  formatUserTime,
} from "../formatters";
import { setRuntimeUserPreferences } from "../runtime";

describe("personalized formatters", () => {
  beforeEach(() => setRuntimeUserPreferences({}));

  it("formats date-only values without shifting the calendar day", () => {
    setRuntimeUserPreferences({ date_format: "DD/MM/YYYY" });
    expect(formatUserDate("2026-08-09")).toBe("09/08/2026");
    setRuntimeUserPreferences({ date_format: "YYYY-MM-DD" });
    expect(formatUserDate("2026-08-09")).toBe("2026-08-09");
  });

  it("uses the selected 12 or 24 hour clock", () => {
    const input = new Date(2026, 7, 9, 15, 45);
    setRuntimeUserPreferences({ time_format: "12h" });
    expect(formatUserTime(input)).toBe("3:45 PM");
    setRuntimeUserPreferences({ time_format: "24h" });
    expect(formatUserTime(input)).toBe("15:45");
  });

  it("uses selected number and currency conventions", () => {
    setRuntimeUserPreferences({ number_format: "1 234,56", currency_format: "EUR" });
    expect(formatUserNumber(1234.56)).toBe("1 234,56");
    expect(formatUserCurrency(1234.5)).toContain("€");
  });

  it("converts supported weight display without changing stored pounds", () => {
    setRuntimeUserPreferences({ measurement_units: "imperial" });
    expect(formatUserMeasurement(12500, "weight")).toBe("12,500 lb");
    setRuntimeUserPreferences({ measurement_units: "metric" });
    expect(formatUserMeasurement(12500, "weight")).toBe("5,670 kg");
  });
});
