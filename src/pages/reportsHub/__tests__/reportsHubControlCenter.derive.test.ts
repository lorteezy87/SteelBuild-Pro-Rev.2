/**
 * Unit tests for buildReportsSummary.
 * Pure function — no React, no network, no module mocks needed.
 */
import { describe, it, expect } from "vitest";
import {
  buildReportsSummary,
  type ReportCatalogEntry,
} from "../reportsHubControlCenter.derive";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(
  slug: string,
  category: string,
  title?: string
): ReportCatalogEntry {
  return { slug, title: title ?? slug, summary: "–", category, component: null };
}

const MINI_CATALOG: ReportCatalogEntry[] = [
  makeEntry("portfolio-overview", "Portfolio", "Portfolio Overview"),
  makeEntry("financial-kpis", "Financial", "Financial KPIs"),
  makeEntry("risks", "Risk", "Risks"),
  makeEntry("risks-dashboard", "Risk", "Risks Dashboard"),
  makeEntry("schedule", "Schedule", "Schedule"),
  makeEntry("profit", "Cost", "Profit"),
  makeEntry("team-dashboard", "Team", "Team Dashboard"),
  // Ensure the curated FEATURED_SLUGS entries resolve correctly.
  makeEntry("project-details", "Portfolio", "Project Details"),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildReportsSummary — basic counts", () => {
  it("totalReports equals catalog length", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.totalReports).toBe(MINI_CATALOG.length);
  });

  it("totalCategories counts distinct categories", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    // Portfolio, Financial, Risk, Schedule, Cost, Team → 6
    expect(s.totalCategories).toBe(6);
  });

  it("riskCount sums Risk entries only", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.riskCount).toBe(2);
  });

  it("financialCount sums Financial + Cost", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    // 1 Financial + 1 Cost = 2
    expect(s.financialCount).toBe(2);
  });

  it("scheduleCount reflects Schedule entries", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.scheduleCount).toBe(1);
  });
});

describe("buildReportsSummary — no favorites", () => {
  it("favoritesCount is 0 when no favorites passed", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.favoritesCount).toBe(0);
  });

  it("favoriteEntries is empty when no favorites", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.favoriteEntries).toHaveLength(0);
  });

  it("featuredReports falls back to curated FEATURED_SLUGS list", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    // All FEATURED_SLUGS that exist in MINI_CATALOG should appear.
    // The curated list: portfolio-overview, financial-kpis, project-details, risks-dashboard, schedule, team-dashboard.
    // risks-dashboard is in MINI_CATALOG; project-details is in MINI_CATALOG.
    const slugs = s.featuredReports.map((r) => r.slug);
    expect(slugs).toContain("portfolio-overview");
    expect(slugs).toContain("financial-kpis");
    expect(slugs).toContain("schedule");
    expect(slugs).toContain("team-dashboard");
  });

  it("featuredReports contains at most 6 entries", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    expect(s.featuredReports.length).toBeLessThanOrEqual(6);
  });
});

describe("buildReportsSummary — with favorites", () => {
  it("favoritesCount matches the favorites array length", () => {
    const s = buildReportsSummary(MINI_CATALOG, ["schedule", "profit"]);
    expect(s.favoritesCount).toBe(2);
  });

  it("favoriteEntries resolves to full entries in order", () => {
    const s = buildReportsSummary(MINI_CATALOG, ["profit", "schedule"]);
    expect(s.favoriteEntries[0].slug).toBe("profit");
    expect(s.favoriteEntries[1].slug).toBe("schedule");
  });

  it("featuredReports uses favorites when favorites exist", () => {
    const s = buildReportsSummary(MINI_CATALOG, ["schedule", "profit"]);
    const slugs = s.featuredReports.map((r) => r.slug);
    expect(slugs).toContain("schedule");
    expect(slugs).toContain("profit");
  });

  it("unknown favorite slugs are silently dropped", () => {
    const s = buildReportsSummary(MINI_CATALOG, [
      "schedule",
      "does-not-exist",
      "profit",
    ]);
    expect(s.favoriteEntries).toHaveLength(2);
    expect(s.favoritesCount).toBe(3); // raw count, not resolved count
  });
});

describe("buildReportsSummary — byCategory ordering", () => {
  it("byCategory follows CATEGORY_ORDER", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    const cats = s.byCategory.map((r) => r.category);
    // Portfolio comes before Financial, Risk before Schedule, Cost before Team.
    expect(cats.indexOf("Portfolio")).toBeLessThan(cats.indexOf("Financial"));
    expect(cats.indexOf("Financial")).toBeLessThan(cats.indexOf("Risk"));
    expect(cats.indexOf("Schedule")).toBeLessThan(cats.indexOf("Cost"));
  });

  it("byCategory counts are correct", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    const risk = s.byCategory.find((r) => r.category === "Risk");
    expect(risk?.count).toBe(2);
  });

  it("byCategory entries include accent color", () => {
    const s = buildReportsSummary(MINI_CATALOG);
    for (const row of s.byCategory) {
      expect(typeof row.accent).toBe("string");
      expect(row.accent.length).toBeGreaterThan(0);
    }
  });
});

describe("buildReportsSummary — empty catalog", () => {
  it("handles empty catalog gracefully", () => {
    const s = buildReportsSummary([]);
    expect(s.totalReports).toBe(0);
    expect(s.totalCategories).toBe(0);
    expect(s.featuredReports).toHaveLength(0);
    expect(s.byCategory).toHaveLength(0);
  });
});
