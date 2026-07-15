/**
 * Pure derivations for the Reports & Insights Control Center (canonical presentation redesign).
 * No React, no network.
 *
 * DATA AVAILABILITY NOTE:
 * The report catalog is a static registry (pages/reports/registry.js) — there is
 * NO per-report run telemetry, usage count, or scheduled-run data in the DB.
 * KPIs are therefore derived exclusively from the catalog shape itself, with a
 * favorites/recently-opened list optionally supplied by the caller (localStorage).
 *
 * Any field marked MISSING below cannot be populated without a new DB table.
 */

/** Shape of a single registry entry (mirrors registry.js ReportEntry typedef). */
export interface ReportCatalogEntry {
  slug: string;
  title: string;
  summary: string;
  category: string;
  /** Lazy React component — passed through but NOT consumed inside this module. */
  component: unknown;
}

/** Category-level summary row for the "By Category" panel. */
export interface CategorySummaryRow {
  category: string;
  count: number;
  /** Representative accent color — determined by category name. */
  accent: string;
}

/** Aggregate KPIs derivable from the static catalog + optional favorites list. */
export interface ReportsSummary {
  /** Total registered reports. */
  totalReports: number;
  /** Unique categories present in the catalog. */
  totalCategories: number;
  /** Count of reports the user has favorited (local). 0 if no favorites passed. */
  favoritesCount: number;
  /** Schedule reports (category === "Schedule"). */
  scheduleCount: number;
  /** Financial + Cost reports. */
  financialCount: number;
  /** Risk reports. */
  riskCount: number;

  // ── Queues for Decision Panels ──────────────────────────────────────────────
  /** Top 6 reports for the "Report Library" panel — ordered by category priority then alpha. */
  featuredReports: ReportCatalogEntry[];
  /** Favorite slugs resolved to full entries. */
  favoriteEntries: ReportCatalogEntry[];
  /** Category breakdown rows for the "By Category" panel. */
  byCategory: CategorySummaryRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Display order from registry.js REPORT_CATEGORIES. */
const CATEGORY_ORDER: string[] = [
  "Portfolio",
  "Financial",
  "Risk",
  "Schedule",
  "Cost",
  "Team",
];

/** Visual accent per category — mirrors Reports.jsx CATEGORY_ACCENT. */
const CATEGORY_ACCENT: Record<string, string> = {
  Portfolio: "var(--status-info)",
  Financial: "var(--status-info)",
  Risk: "var(--status-error)",
  Schedule: "var(--accent)",
  Cost: "var(--status-success)",
  Team: "var(--accent-light)",
};

/**
 * Slugs that represent the highest-value "flagship" reports to surface first
 * in the featured panel when no favorites exist. Order is intentional.
 */
const FEATURED_SLUGS = [
  "portfolio-overview",
  "financial-kpis",
  "project-details",
  "risks-dashboard",
  "schedule",
  "team-dashboard",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function accentForCategory(cat: string): string {
  return CATEGORY_ACCENT[cat] ?? "var(--accent)";
}

function categoryOrder(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

// ── Main derivation ───────────────────────────────────────────────────────────

/**
 * Build all KPIs + panel queues for the Reports & Insights Control Center.
 *
 * @param catalog  The full REPORTS array from registry.js (static, ~39 entries).
 * @param favorites  Optional array of slugs the user has favorited (localStorage).
 *                   Pass `[]` or omit if the caller hasn't implemented favorites yet.
 */
export function buildReportsSummary(
  catalog: ReportCatalogEntry[],
  favorites: string[] = []
): ReportsSummary {
  const totalReports = catalog.length;

  // Category breakdown — ordered by CATEGORY_ORDER.
  const catMap = new Map<string, number>();
  for (const r of catalog) {
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + 1);
  }
  const byCategory: CategorySummaryRow[] = Array.from(catMap.entries())
    .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b))
    .map(([category, count]) => ({
      category,
      count,
      accent: accentForCategory(category),
    }));

  const totalCategories = byCategory.length;

  // Favorites resolved to full entries (preserving order; unknown slugs dropped).
  const bySlug = new Map(catalog.map((r) => [r.slug, r]));
  const favoriteEntries = favorites
    .map((slug) => bySlug.get(slug))
    .filter((r): r is ReportCatalogEntry => r !== undefined);

  // Featured reports: use favorites if present, else the curated FEATURED_SLUGS list.
  const featuredReports =
    favoriteEntries.length > 0
      ? favoriteEntries.slice(0, 6)
      : FEATURED_SLUGS.map((slug) => bySlug.get(slug)).filter(
          (r): r is ReportCatalogEntry => r !== undefined
        );

  // Category counts used for KPI strip.
  const scheduleCount = catMap.get("Schedule") ?? 0;
  const financialCount = (catMap.get("Financial") ?? 0) + (catMap.get("Cost") ?? 0);
  const riskCount = catMap.get("Risk") ?? 0;

  return {
    totalReports,
    totalCategories,
    favoritesCount: favorites.length,
    scheduleCount,
    financialCount,
    riskCount,
    featuredReports,
    favoriteEntries,
    byCategory,
  };
}
