/**
 * VendorControlCenter — Command UI skin for the Vendors page.
 *
 * Presentation-only. All data, mutations, and selection state live in
 * Vendors.jsx and are passed down as props, matching the RfiControlCenter
 * pattern.
 */
import { useMemo } from "react";
import {
  Building2, Star, AlertTriangle, Clock, DollarSign, ShieldCheck,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import {
  buildVendorSummary, vendorStatusTone, daysUntilExpiry,
} from "./vendorControlCenter.derive";
import type { VendorRecord, VendorStatsMap } from "./vendorControlCenter.derive";
import { formatCurrencyShort, formatDate } from "@/components/shared/formatters";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = ["All", "Active", "Inactive", "Probation", "Suspended"] as const;

/** Scroll the DataTable into view when a DecisionPanel fires "View all". */
function scrollToTable() {
  document.querySelector(".vendor-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Expiry cell: red if expired, amber if ≤30 days, plain otherwise.
 * Returns "—" when no date is set.
 */
function expiryCell(dateStr?: string | null) {
  if (!dateStr) return <span className="cmd-row__meta">—</span>;
  const d = daysUntilExpiry(dateStr);
  if (d !== null && d < 0) {
    return <span style={{ color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{formatDate(dateStr)} · expired</span>;
  }
  if (d !== null && d <= 30) {
    return <span style={{ color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{formatDate(dateStr)} · {d}d</span>;
  }
  return <span>{formatDate(dateStr)}</span>;
}

/** Company cell — preferred star prefix. */
function companyCell(v: VendorRecord) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {v.is_preferred && <Star size={10} fill="var(--status-success)" style={{ color: "var(--status-success)", flexShrink: 0 }} />}
      {v.company_name || "—"}
    </span>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface VendorControlCenterProps {
  vendors: VendorRecord[];
  filtered: VendorRecord[];
  vendorStats: VendorStatsMap;
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  vendorTypes: string[];
  onExport: () => void;
  onCreate: (() => void) | null;
  onOpenVendor: (v: VendorRecord) => void;
  projectHealth?: string | null;
  percentComplete?: number | null;
  /** Bulk selection (drives the checkbox column + parent BulkActionBar). */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VendorControlCenter(props: VendorControlCenterProps) {
  const {
    vendors, filtered, vendorStats,
    search, onSearch,
    statusFilter, onStatusFilterChange,
    typeFilter, onTypeFilterChange,
    vendorTypes,
    onExport, onCreate, onOpenVendor,
    projectHealth, percentComplete,
    selectedIds, onToggleSelect, onToggleAll,
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildVendorSummary(vendors, vendorStats), [vendors, vendorStats]);

  // ── Hero ──
  const heroStats = [
    { value: projectHealth || "—", label: "Project Health" },
    { value: percentComplete != null ? `${Math.round(percentComplete)}%` : "—", label: "Complete" },
  ];
  const heroChips = [
    { label: `${s.total} Total` },
    { label: `${s.active} Active`, tone: "good" as const },
    { label: `${s.atRisk} At Risk`, ...(s.atRisk > 0 ? { tone: "danger" as const } : {}) },
  ];

  // ── KPI strip ──
  const kpiCells: KpiCellDef[] = [
    { label: "Total Vendors",  value: s.total,        sublabel: "vendors",   tone: "neutral", Icon: Building2 },
    { label: "Active",         value: s.active,       sublabel: "vendors",   tone: "good",    Icon: Building2 },
    { label: "Preferred",      value: s.preferred,    sublabel: "vendors",   tone: "info",    Icon: Star },
    { label: "At Risk",        value: s.atRisk,       sublabel: "vendors",   tone: s.atRisk > 0 ? "danger" : "neutral", Icon: AlertTriangle },
    { label: "Ins. Expiring",  value: s.expiringSoon, sublabel: "≤30 days",  tone: s.expiringSoon > 0 ? "warn" : "neutral", Icon: ShieldCheck },
    { label: "Avg On-Time",    value: s.avgOnTime != null ? `${s.avgOnTime}%` : "—", sublabel: "delivery rate", tone: s.avgOnTime != null && s.avgOnTime < 70 ? "danger" : s.avgOnTime != null && s.avgOnTime < 85 ? "warn" : "good", Icon: Clock },
    { label: "Total Spend",    value: formatCurrencyShort(s.totalSpend), sublabel: "all vendors", tone: s.totalSpend > 0 ? "info" : "neutral", Icon: DollarSign },
  ];

  // ── Decision panels data ──

  // Compliance queue — label says why (expired vs expiring soon)
  function complianceReason(v: VendorRecord): string {
    const reasons: string[] = [];
    const insDays = daysUntilExpiry(v.insurance_expiry);
    const certDays = daysUntilExpiry(v.certifications_expiry);
    if (insDays !== null && insDays < 0) reasons.push("Ins. expired");
    else if (insDays !== null && insDays <= 30) reasons.push(`Ins. in ${insDays}d`);
    if (certDays !== null && certDays < 0) reasons.push("Cert expired");
    else if (certDays !== null && certDays <= 30) reasons.push(`Cert in ${certDays}d`);
    return reasons.join(" · ") || "Review";
  }

  // ── Table columns ──
  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected =
    selectable && filtered.length > 0 && selectedIds!.size === filtered.length;

  const columns: Column<VendorRecord>[] = [
    ...(selectable
      ? ([{
          key: "sel",
          header: (
            <input
              type="checkbox"
              className="cmd-check"
              checked={allSelected}
              onChange={(e) => onToggleAll!(e.target.checked)}
              aria-label="Select all vendors"
            />
          ),
          render: (v: VendorRecord) => (
            <input
              type="checkbox"
              className="cmd-check"
              checked={selectedIds!.has(v.id || "")}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect!(v.id || "")}
              aria-label="Select vendor"
            />
          ),
        }] as Column<VendorRecord>[])
      : []),
    { key: "company", header: "Company",      render: companyCell },
    { key: "type",    header: "Type",         render: (v) => v.vendor_type || "—" },
    { key: "status",  header: "Status",       render: (v) => <Pill tone={vendorStatusTone(v.status)}>{v.status || "Active"}</Pill> },
    { key: "contact", header: "Contact",      render: (v) => v.contact_person || <span className="cmd-row__meta">—</span> },
    {
      key: "ins_exp",
      header: "Insurance Exp.",
      render: (v) => expiryCell(v.insurance_expiry),
    },
    {
      key: "cert_exp",
      header: "Cert Expiry",
      render: (v) => expiryCell(v.certifications_expiry),
    },
    {
      key: "deliveries",
      header: "Deliveries",
      align: "right" as const,
      render: (v) => {
        const stat = vendorStats[v.company_name ?? ""];
        return stat?.deliveryCount ? String(stat.deliveryCount) : <span className="cmd-row__meta">—</span>;
      },
    },
    {
      key: "ontime",
      header: "On-Time %",
      align: "right" as const,
      render: (v) => {
        const stat = vendorStats[v.company_name ?? ""];
        if (stat?.onTimeRate == null) return <span className="cmd-row__meta">—</span>;
        const tone = stat.onTimeRate >= 85 ? "var(--status-success)" : stat.onTimeRate >= 70 ? "var(--status-warning)" : "var(--status-error)";
        return <span style={{ color: tone, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>{stat.onTimeRate}%</span>;
      },
    },
    {
      key: "spend",
      header: "Spend",
      align: "right" as const,
      render: (v) => {
        const spend = vendorStats[v.company_name ?? ""]?.totalSpend ?? 0;
        return spend > 0
          ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>{formatCurrencyShort(spend)}</span>
          : <span className="cmd-row__meta">—</span>;
      },
    },
  ];

  // ── Dynamic type chips ──
  const typeChips = ["All", ...vendorTypes];

  return (
    <div className="vendor-cc">
      <PageHero
        Icon={Building2}
        title="Vendor Control Center"
        subtitle="Monitor supply-chain performance, compliance status, and spend across all vendors."
        chips={heroChips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Compliance Work Queue */}
        <DecisionPanel title="Compliance Work Queue" onViewAll={scrollToTable}>
          {s.complianceQueue.length === 0 ? (
            <div className="cmd-row__meta">No compliance issues.</div>
          ) : (
            s.complianceQueue.slice(0, 6).map((v) => (
              <div className="cmd-row is-clickable" key={v.id} onClick={() => onOpenVendor(v)}>
                <div>
                  <div className="cmd-row__num">{v.company_name || "—"}</div>
                  <div className="cmd-row__meta">{complianceReason(v)}</div>
                </div>
                {(() => {
                  const insDays = daysUntilExpiry(v.insurance_expiry);
                  const certDays = daysUntilExpiry(v.certifications_expiry);
                  const earliestDays = [insDays, certDays].filter((d): d is number => d !== null).reduce(
                    (min, d) => Math.min(min, d), Infinity,
                  );
                  const tone = earliestDays < 0 ? "danger" : "warn";
                  return <Pill tone={tone}>{earliestDays < 0 ? "Expired" : `${earliestDays}d`}</Pill>;
                })()}
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Performance Watchlist */}
        <DecisionPanel title="Performance Watchlist" onViewAll={scrollToTable}>
          {s.watchlist.length === 0 ? (
            <div className="cmd-row__meta">All vendors performing well.</div>
          ) : (
            s.watchlist.slice(0, 6).map((v) => {
              const stat = vendorStats[v.company_name ?? ""];
              return (
                <div className="cmd-row is-clickable" key={v.id} onClick={() => onOpenVendor(v)}>
                  <div>
                    <div className="cmd-row__num">{v.company_name || "—"}</div>
                    <div className="cmd-row__meta">{v.status === "Probation" ? "On probation" : "Low delivery rate"}</div>
                  </div>
                  <Pill tone={vendorStatusTone(v.status)}>
                    {stat?.onTimeRate != null ? `${stat.onTimeRate}%` : v.status || "—"}
                  </Pill>
                </div>
              );
            })
          )}
        </DecisionPanel>

        {/* Top Vendors by Spend */}
        <DecisionPanel title="Top Vendors by Spend" onViewAll={scrollToTable}>
          {s.topSpenders.length === 0 ? (
            <div className="cmd-row__meta">No spend data yet.</div>
          ) : (
            s.topSpenders.map((v) => {
              const spend = vendorStats[v.company_name ?? ""]?.totalSpend ?? 0;
              return (
                <div className="cmd-row is-clickable" key={v.id} onClick={() => onOpenVendor(v)}>
                  <div className="cmd-row__num">{v.company_name || "—"}</div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>
                    {formatCurrencyShort(spend)}
                  </span>
                </div>
              );
            })
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search vendor name, contact, or type"
        onExport={onExport}
        onImport={null}
        primaryLabel="New Vendor"
        onPrimary={onCreate}
        filters={
          <>
            {/* Status chips */}
            {STATUS_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                className={`cmd-chip-btn${statusFilter === label || (label === "All" && statusFilter === "all") ? " is-active" : ""}`}
                onClick={() => onStatusFilterChange(label === "All" ? "all" : label)}
              >
                {label}
              </button>
            ))}

            {/* Type chips — only rendered when there are multiple types */}
            {vendorTypes.length > 0 && (
              <>
                <span className="cmd-chip-divider" style={{ display: "inline-block", width: 1, height: 16, background: "var(--divider)", margin: "0 4px", verticalAlign: "middle" }} />
                {typeChips.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`cmd-chip-btn${typeFilter === t || (t === "All" && typeFilter === "all") ? " is-active" : ""}`}
                    onClick={() => onTypeFilterChange(t === "All" ? "all" : t)}
                  >
                    {t}
                  </button>
                ))}
              </>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenVendor}
        emptyMessage="No vendors match your filters."
      />
    </div>
  );
}
