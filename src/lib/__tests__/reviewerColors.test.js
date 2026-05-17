import { describe, it, expect } from "vitest";
import {
  REVIEWER_COLORS,
  REVIEWER_COLOR_FALLBACK,
  getReviewerColor,
  inferReviewerColor,
  KNOWN_REVIEWER_ROLES,
} from "../reviewerColors.js";

describe("reviewerColors", () => {
  it("maps the trade roles named in the spec", () => {
    expect(getReviewerColor("EOR")).toBe("#3b82f6");
    expect(getReviewerColor("GC")).toBe("#10b981");
    expect(getReviewerColor("Architect")).toBe("#a855f7");
    expect(getReviewerColor("Owner")).toBe("#f97316");
    expect(getReviewerColor("Detailer")).toBe("#f59e0b");
    expect(getReviewerColor("Fabricator")).toBe("#f59e0b");
  });

  it("maps app-permission roles too (useAppSecurity output)", () => {
    expect(getReviewerColor("admin")).toBe("#a855f7");
    expect(getReviewerColor("pm")).toBe("#3b82f6");
    expect(getReviewerColor("field")).toBe("#10b981");
    expect(getReviewerColor("viewer")).toBe("#6b7280");
  });

  it("matches case-insensitively", () => {
    expect(getReviewerColor("eor")).toBe("#3b82f6");
    expect(getReviewerColor("ARCHITECT")).toBe("#a855f7");
    expect(getReviewerColor("Pm")).toBe("#3b82f6");
  });

  it("falls back to grey for unknown / null / non-string input", () => {
    expect(getReviewerColor("Subcontractor")).toBe(REVIEWER_COLOR_FALLBACK);
    expect(getReviewerColor("")).toBe(REVIEWER_COLOR_FALLBACK);
    expect(getReviewerColor(null)).toBe(REVIEWER_COLOR_FALLBACK);
    expect(getReviewerColor(undefined)).toBe(REVIEWER_COLOR_FALLBACK);
    expect(getReviewerColor(42)).toBe(REVIEWER_COLOR_FALLBACK);
  });

  it("inferReviewerColor returns the same fallback when no label", () => {
    expect(inferReviewerColor()).toBe(REVIEWER_COLOR_FALLBACK);
    expect(inferReviewerColor({})).toBe(REVIEWER_COLOR_FALLBACK);
    expect(inferReviewerColor({ roleLabel: "EOR" })).toBe("#3b82f6");
  });

  it("exposes a stable, frozen color map", () => {
    expect(Object.isFrozen(REVIEWER_COLORS)).toBe(true);
    expect(KNOWN_REVIEWER_ROLES).toContain("EOR");
    expect(KNOWN_REVIEWER_ROLES).not.toContain("Other");
  });
});
