/**
 * Reports & Insights Control Center — command_ui reskin of ReportsHub.
 *
 * Data note: the report catalog is fully static (registry.js). There is NO
 * per-report run telemetry, usage count, scheduled-run date, or last-run
 * timestamp in the DB — those columns are MISSING. KPIs are derived from the
 * catalog shape only. "Last Run" shows "—" throughout.
 */
import { useMemo } from "react";
import { BarChart3, BookOpen, Star, LayoutGrid } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import {
  buildReportsSummary,
  type ReportCatalogEntry,
} from "./reportsHubControlCenter.derive";

// ── Local helpers ──────────────────────────────────────────────────────────────

/** Maps category string to the closest semantic Pill tone. */
function categoryTone(
  cat: string
): "danger" | "warn" | "good" | "info" | "neutral" {
  switch (cat) {
    case "Risk":
      return "danger";
    case "Financial":
    case "Cost":
      return "good";
    case "Schedule":
      return "warn";
    case "Portfolio":
      return "info";
    default:
      return "neutral";
  }
}

function scrollToTable() {
  document
    .querySelector(".reports-hub-cc .cmd-table-wrap")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Category accent colors (inline, mirrors registry.js) ──────────────────────
const CATEGORY_ACCENT: Record<string, string> = {
  Portfolio: "var(--status-info)",
  Financial: "var(--status-info)",
  Risk: "var(--status-error)",
  Schedule: "var(--accent)",
  Cost: "var(--status-success)",
  Team: "var(--accent-light)",
};

// ── Category filter values ─────────────────────────────────────────────────────
const CATEGORY_FILTERS = [
  "All",
  "Portfolio",
  "Financial",
  "Risk",
  "Schedule",
  "Cost",
  "Team",
];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ReportsHubControlCenterProps {
  /** The full REPORTS array from registry.js. Never empty in practice. */
  catalog: ReportCatalogEntry[];
  /** Caller-filtered rows that drive the DataTable (search + category applied). */
  filtered: ReportCatalogEntry[];
  search: string;
  onSearch: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  /** Navigate into a specific report (e.g. navigate(`/Reports/${entry.slug}`)). */
  onOpenReport: (entry: ReportCatalogEntry) => void;
  /** Optional favorite slugs (localStorage); drives the middle panel. */
  favorites?: string[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ReportsHubControlCenter(
  props: ReportsHubControlCenterProps
) {
  const {
    catalog,
    filtered,
    search,
    onSearch,
    categoryFilter,
    onCategoryChange,
    onOpenReport,
    favorites = [],
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildReportsSummary(catalog, favorites), [catalog, favorites]);

  // ── Hero ─────────────────────────────────────────────────────────────────────
  const chips = [
    { label: `${s.totalReports} Reports`, tone: "good" as const },
    { label: `${s.totalCategories} Categories` },
    { label: `${s.favoritesCount} Favorites` },
  ];

  // ── KPI strip — all sourced from static catalog ───────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Total Reports",
      value: s.totalReports,
      sublabel: "in catalog",
      tone: "good",
      Icon: BookOpen,
    },
    {
      label: "Categories",
      value: s.totalCategories,
      sublabel: "report types",
      tone: "neutral",
      Icon: LayoutGrid,
    },
    {
      label: "Schedule",
      value: s.scheduleCount,
      sublabel: "reports",
      tone: "warn",
      Icon: BarChart3,
    },
    {
      label: "Financial + Cost",
      value: s.financialCount,
      sublabel: "reports",
      tone: "good",
      Icon: BarChart3,
    },
    {
      label: "Risk",
      value: s.riskCount,
      sublabel: "reports",
      tone: s.riskCount ? "danger" : "neutral",
      Icon: BarChart3,
    },
  ];

  // ── DataTable columns ─────────────────────────────────────────────────────
  const columns: Column<ReportCatalogEntry>[] = [
    {
      key: "title",
      header: "Report",
      render: (r) => (
        <span style={{ fontWeight: 600 }}>{r.title}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (r) => (
        <Pill tone={categoryTone(r.category)}>{r.category}</Pill>
      ),
    },
    {
      key: "summary",
      header: "Description",
      render: (r) => (
        <span className="cmd-row__meta">{r.summary}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="cmd-row__meta">
          {r.slug.includes("dashboard") || r.slug.includes("overview")
            ? "Dashboard"
            : r.slug.includes("status") || r.slug.includes("rag")
            ? "Status"
            : r.slug.includes("forecast") || r.slug.includes("roadmap")
            ? "Forecast"
            : "Report"}
        </span>
      ),
    },
    {
      // MISSING: no last-run telemetry in DB — always shows "—"
      key: "lastRun",
      header: "Last Run",
      align: "right",
      render: () => <span className="cmd-row__meta">—</span>,
    },
    {
      // MISSING: no scheduled-run data in DB — always shows "—"
      key: "status",
      header: "Status",
      render: () => (
        <Pill tone="good">Active</Pill>
      ),
    },
  ];

  return (
    <div className="reports-hub-cc">
      <PageHero
        Icon={BarChart3}
        title="Reports & Insights"
        subtitle="Analyze project performance and export the data that drives decisions."
        chips={chips}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — Report Library (curated / featured) */}
        <DecisionPanel
          title="Report Library"
          onViewAll={scrollToTable}
        >
          {s.featuredReports.map((r) => {
            const accent = CATEGORY_ACCENT[r.category] ?? "var(--accent)";
            return (
              <div
                className="cmd-row is-clickable"
                key={r.slug}
                onClick={() => onOpenReport(r)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="cmd-row__num"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="cmd-row__meta"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.summary}
                  </div>
                </div>
                <Pill tone={categoryTone(r.category)}>{r.category}</Pill>
              </div>
            );
          })}
          {s.featuredReports.length === 0 && (
            <div className="cmd-row__meta">No reports in catalog.</div>
          )}
        </DecisionPanel>

        {/* Panel 2 — Favorites or prompt to open reports */}
        <DecisionPanel
          title={
            s.favoriteEntries.length > 0
              ? "Favorites"
              : "Recently Featured"
          }
          onViewAll={scrollToTable}
        >
          {s.favoriteEntries.length > 0 ? (
            s.favoriteEntries.map((r) => (
              <div
                className="cmd-row is-clickable"
                key={r.slug}
                onClick={() => onOpenReport(r)}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Star
                    size={11}
                    style={{ color: "#F2A706", flexShrink: 0 }}
                  />
                  <div>
                    <div className="cmd-row__num">{r.title}</div>
                    <div className="cmd-row__meta">{r.category}</div>
                  </div>
                </div>
                <Pill tone={categoryTone(r.category)}>{r.category}</Pill>
              </div>
            ))
          ) : (
            /* No favorites yet — show the first few reports as a prompt */
            catalog.slice(0, 5).map((r) => (
              <div
                className="cmd-row is-clickable"
                key={r.slug}
                onClick={() => onOpenReport(r)}
              >
                <div className="cmd-row__num">{r.title}</div>
                <span className="cmd-row__meta">{r.category}</span>
              </div>
            ))
          )}
          {catalog.length === 0 && (
            <div className="cmd-row__meta">No reports available.</div>
          )}
        </DecisionPanel>

        {/* Panel 3 — By Category breakdown */}
        <DecisionPanel
          title="By Category"
          onViewAll={scrollToTable}
        >
          {s.byCategory.map((row) => (
            <div
              className="cmd-row is-clickable"
              key={row.category}
              onClick={() => onCategoryChange(row.category)}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: row.accent,
                    flexShrink: 0,
                  }}
                />
                <span className="cmd-row__num">{row.category}</span>
              </div>
              <div className="cmd-row__meta">
                {row.count} report{row.count !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
          {s.byCategory.length === 0 && (
            <div className="cmd-row__meta">No categories found.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search by report name or description"
        primaryLabel="Open Report"
        onPrimary={
          filtered.length === 1 ? () => onOpenReport(filtered[0]) : null
        }
        filters={
          <>
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cmd-chip-btn${
                  categoryFilter === cat ? " is-active" : ""
                }`}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns as unknown as Column<{ id?: string }>[]}
        rows={filtered as unknown as { id?: string }[]}
        onRowClick={onOpenReport as unknown as (row: { id?: string }) => void}
        emptyMessage="No reports match your filters."
      />
    </div>
  );
}
