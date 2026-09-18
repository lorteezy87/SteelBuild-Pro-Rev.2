/**
 * Reports & Insights Control Center — canonical presentation reskin of ReportsHub.
 *
 * Data note: the report catalog is fully static (registry.js). There is NO
 * per-report run telemetry, usage count, scheduled-run date, or last-run
 * timestamp in the DB — those columns are MISSING. KPIs are derived from the
 * catalog shape only. "Last Run" shows "—" throughout.
 */
import { useMemo } from "react";
import { Star } from "lucide-react";
import "@/styles/command.css";
import {
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column } from "@/components/command";
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

  const operationalMetrics = [
    { label: "Total Reports", value: s.totalReports, sublabel: "in catalog", tone: "good" as const },
    { label: "Categories", value: s.totalCategories, sublabel: "report types", tone: "neutral" as const },
    { label: "Schedule", value: s.scheduleCount, sublabel: "reports", tone: "warn" as const },
    { label: "Financial + Cost", value: s.financialCount, sublabel: "reports", tone: "good" as const },
    { label: "Risk", value: s.riskCount, sublabel: "reports", tone: s.riskCount ? "danger" as const : "neutral" as const },
    { label: "Favorites", value: s.favoritesCount, sublabel: "saved reports", tone: s.favoritesCount ? "info" as const : "neutral" as const },
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
    <div className="reports-hub-cc sbp-command-page">
      <PageHeader
        eyebrow="Reports / Analysis"
        title="Reports & Insights"
        subtitle="Project, portfolio, schedule, financial, risk, and team reporting."
        meta={`${s.totalReports} reports · ${s.totalCategories} categories · ${s.favoritesCount} favorites`}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Reports catalog summary" />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Report Library</h2></div>
          <div>
            {s.featuredReports.length === 0 ? <div className="sbp-attention__empty">No reports in catalog.</div> : s.featuredReports.map((report) => (
              <button type="button" className="cmd-row is-clickable" key={report.slug} onClick={() => onOpenReport(report)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div><div className="cmd-row__num">{report.title}</div><div className="cmd-row__meta">{report.summary}</div></div>
                <Pill tone={categoryTone(report.category)}>{report.category}</Pill>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>{s.favoriteEntries.length > 0 ? "Favorites" : "Recently Featured"}</h2></div>
          <div>
            {(s.favoriteEntries.length > 0 ? s.favoriteEntries : catalog.slice(0, 5)).map((report) => (
              <button type="button" className="cmd-row is-clickable" key={report.slug} onClick={() => onOpenReport(report)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {s.favoriteEntries.length > 0 ? <Star size={11} style={{ color: "var(--accent)" }} /> : null}
                  <div><div className="cmd-row__num">{report.title}</div><div className="cmd-row__meta">{report.category}</div></div>
                </div>
                <Pill tone={categoryTone(report.category)}>{report.category}</Pill>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="sbp-work-panel">
        <div className="sbp-work-panel__head"><h2>By Category</h2></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {s.byCategory.map((row) => (
            <button type="button" className="cmd-row is-clickable" key={row.category} onClick={() => onCategoryChange(row.category)} style={{ border: 0, borderRight: "1px solid var(--cmd-border)", background: "transparent", textAlign: "left" }}>
              <span className="cmd-row__num">{row.category}</span>
              <span className="cmd-row__meta">{row.count} report{row.count === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      </section>

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
