import { describe, it, expect } from "vitest";
import {
  FAMILY_RULES,
  getFamilyMeta,
  safeNumber,
  formatSigned,
  varianceColor,
  periodDisplay,
  agingTintBg,
} from "@/pages/financials/utils";

describe("safeNumber", () => {
  it("returns numeric input unchanged", () => {
    expect(safeNumber(5)).toBe(5);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-12.5)).toBe(-12.5);
  });
  it("coerces numeric strings", () => {
    expect(safeNumber("3.2")).toBe(3.2);
  });
  it("returns 0 for non-finite / invalid", () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber("abc")).toBe(0);
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber(Infinity)).toBe(0);
  });
});

describe("formatSigned", () => {
  it("returns em-dash for null/empty/non-finite", () => {
    expect(formatSigned(null)).toBe("\u2014");
    expect(formatSigned("")).toBe("\u2014");
    expect(formatSigned(undefined)).toBe("\u2014");
    expect(formatSigned("abc")).toBe("\u2014");
  });
  it("returns $0 for zero", () => {
    expect(formatSigned(0)).toBe("$0");
  });
  it("prefixes positive values with +", () => {
    expect(formatSigned(1000)).toBe("+$1,000.00");
    expect(formatSigned(0.5)).toBe("+$0.50");
  });
  it("keeps negative sign from formatCurrency (no +)", () => {
    const result = formatSigned(-500);
    expect(result.startsWith("+")).toBe(false);
    expect(result).toContain("500");
  });
});

describe("varianceColor", () => {
  it("maps negative → error, positive → success, zero → muted", () => {
    expect(varianceColor(-1)).toBe("var(--status-error)");
    expect(varianceColor(1)).toBe("var(--status-success)");
    expect(varianceColor(0)).toBe("var(--text-muted)");
  });
});

describe("getFamilyMeta", () => {
  it("matches labor keywords", () => {
    expect(getFamilyMeta("Shop Labor").key).toBe("labor");
    expect(getFamilyMeta("fab erection").key).toBe("labor");
    expect(getFamilyMeta("freight").key).toBe("labor");
  });
  it("matches materials keywords", () => {
    expect(getFamilyMeta("Anchor Bolts").key).toBe("materials");
    expect(getFamilyMeta("steel plate").key).toBe("materials");
  });
  it("matches subcontractor keywords", () => {
    expect(getFamilyMeta("Detailing services").key).toBe("subcontractor");
    expect(getFamilyMeta("Engineering consult").key).toBe("subcontractor");
  });
  it("matches equipment keywords", () => {
    expect(getFamilyMeta("Crane rental").key).toBe("equipment");
    expect(getFamilyMeta("scaffold").key).toBe("equipment");
  });
  it("matches overhead keywords with direct=false", () => {
    const meta = getFamilyMeta("PM/Admin overhead");
    expect(meta.key).toBe("overhead");
    expect(meta.direct).toBe(false);
  });
  it("falls back to misc for unknown text", () => {
    const meta = getFamilyMeta("unrelated zzzz");
    expect(meta.key).toBe("misc");
    expect(meta.direct).toBe(true);
  });
  it("handles nullish input", () => {
    expect(getFamilyMeta(null).key).toBe("misc");
    expect(getFamilyMeta(undefined).key).toBe("misc");
  });
  it("exposes six canonical family keys", () => {
    expect(FAMILY_RULES.map((r) => r.key)).toEqual([
      "labor",
      "materials",
      "subcontractor",
      "equipment",
      "misc",
      "overhead",
    ]);
  });
});

describe("periodDisplay", () => {
  it("returns em-dash when both sides missing", () => {
    expect(periodDisplay(null, null)).toBe("\u2014");
    expect(periodDisplay("", "")).toBe("\u2014");
  });
  it("renders range with en-dash separator when both provided", () => {
    const out = periodDisplay("2025-01-05", "2025-02-10");
    expect(out).toContain("\u2013");
    expect(out).toMatch(/Jan/);
    expect(out).toMatch(/Feb/);
  });
  it("renders single side when only from provided", () => {
    const out = periodDisplay("2025-03-15", null);
    expect(out).toMatch(/Mar/);
    expect(out).not.toContain("\u2013");
  });
  it("renders single side when only to provided", () => {
    const out = periodDisplay(null, "2025-04-20");
    expect(out).toMatch(/Apr/);
    expect(out).not.toContain("\u2013");
  });
  it("skips invalid dates gracefully", () => {
    expect(periodDisplay("not-a-date", null)).toBe("\u2014");
  });
});

describe("agingTintBg", () => {
  it("returns success tint for <= 30 days", () => {
    expect(agingTintBg(0)).toContain("status-success");
    expect(agingTintBg(30)).toContain("status-success");
  });
  it("returns warning tint for 31-60 days", () => {
    expect(agingTintBg(31)).toContain("status-warning");
    expect(agingTintBg(60)).toContain("status-warning");
  });
  it("returns error tint for > 60 days", () => {
    expect(agingTintBg(61)).toContain("status-error");
    expect(agingTintBg(120)).toContain("status-error");
  });
});
