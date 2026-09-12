import { beforeEach, describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatCurrencyShort,
  formatCurrencyWhole,
  roundCurrency,
} from "@/components/shared/formatters";
import { formatCurrency as formatFinancialCurrency } from "@/hooks/useFinancials";
import { setRuntimeUserPreferences } from "@/lib/userPreferences/runtime";

describe("shared formatters", () => {
  beforeEach(() => setRuntimeUserPreferences({}));

  it("preserves exact default currency output", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(-1234.5)).toBe("-$1,234.50");
    expect(formatCurrency(null)).toBe("$0.00");
    expect(formatCurrency("not-a-number", 0)).toBe("$0");
  });

  it("provides canonical whole-dollar and compact displays", () => {
    expect(formatCurrencyWhole(1234.5)).toBe("$1,235");
    expect(formatCurrencyWhole(-1234.5)).toBe("-$1,235");
    expect(formatCurrencyShort(1200)).toBe("$1.2K");
  });

  it("preserves the useFinancials whole-dollar compatibility export", () => {
    expect(formatFinancialCurrency).toBe(formatCurrencyWhole);
    expect(formatFinancialCurrency(1234.5)).toBe("$1,235");
  });

  it("rounds currency safely", () => {
    expect(roundCurrency(1.005)).toBe(1);
    expect(roundCurrency("12.349")).toBe(12.35);
    expect(roundCurrency(undefined)).toBe(0);
  });
});
