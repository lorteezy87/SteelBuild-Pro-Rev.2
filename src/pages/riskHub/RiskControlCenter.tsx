/**
 * RiskControlCenter — Command UI redesign of the Risk / Margin-at-Risk view.
 *
 * Data sources explained:
 *   - `signals` comes from `calculateMarginRisk(sources).signals` (marginRiskEngine).
 *     The engine derives risk from RFIs, submittals, deliveries, schedule tasks,
 *     inspections, and change orders. There is NO dedicated `project_risks` table.
 *   - `constraints` comes from `action_items` with category="CONSTRAINT" (the
 *     same records the classic Constraints page manages).
 *
 * Both data sets are loaded and passed by the parent RiskHub flag-branch.
 * This component is pure presentation — no data fetching, no mutations.
 *
 * CSS wants (inline styles used per task constraint):
 *   .risk-cc wrapper — same pattern as .rfi-cc
 *   .cmd-row__exposure — right-aligned monospaced dollar amount
 */

import { ShieldAlert, AlertTriangle, TrendingDown, DollarSign, Activity, List } from "lucide-react";
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
  buildRiskSummary,
  type FlatRisk,
  type RiskSignal,
} from "./riskControlCenter.derive";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Map FlatRisk severity to a Pill tone.
 * Uses "danger" for critical, "warn" for high, "neutral" for medium — mirrors
 * the RFI Control Center's use of priorityTone().
 */
function severityTone(severity: FlatRisk["severity"]): "danger" | "warn" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warn";
  return "neutral";
}

/** Map mitigationStatus to a Pill tone. */
function mitigationTone(status: string | null): "good" | "warn" | "neutral" {
  if (!status) return "neutral";
  if (status === "In Progress") return "warn";
  if (status === "Open") return "neutral";
  return "neutral";
}

/** Smooth scroll to the table section. */
function scrollToTable() {
  document.querySelector(".risk-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Category chips ─────────────────────────────────────────────────────────────

const BASE_CATEGORIES = ["All", "Open RFIs", "Rejected Submittals", "Schedule Slips", "Late Procurement", "Failed Inspections", "Unsigned Change Orders"];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface RiskControlCenterProps {
  projectName: string;
  /** Output of calculateMarginRisk(sources).signals — the raw engine signal list. */
  signals: RiskSignal[];
  /** Filtered + displayed flat risks (same array already filtered client-side). */
  filtered: FlatRisk[];
  /** All flat risks before filtering — passed to buildRiskSummary. */
  all: FlatRisk[];
  /** Summary result — pre-built by the parent from buildRiskSummary(). */
  summary: ReturnType<typeof buildRiskSummary>;
  search: string;
  onSearch: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  onExport: () => void;
  /** Project-level context for the hero stat cards. */
  totalExposureFmt?: string | null;
  photoSrc?: string;
}

export default function RiskControlCenter(props: RiskControlCenterProps) {
  const {
    projectName,
    signals,
    filtered,
    all,
    summary: s,
    search,
    onSearch,
    categoryFilter,
    onCategoryChange,
    onExport,
    totalExposureFmt,
    photoSrc,
  } = props;

  useCommandSkin();

  const heroStats = [
    { value: totalExposureFmt || fmtMoney(s.totalExposure) || "—", label: "Exposure" },
    { value: s.criticalCount > 0 ? String(s.criticalCount) : "0", label: "Critical" },
  ];

  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.criticalCount} Critical`, tone: "danger" as const },
    { label: `${s.openCount} Open`, tone: "warn" as const },
  ];

  const kpiCells: KpiCellDef[] = [
    {
      label: "Critical",
      value: s.criticalCount,
      sublabel: "risks",
      tone: s.criticalCount ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "High",
      value: s.highCount,
      sublabel: "risks",
      tone: s.highCount ? "warn" : "neutral",
      Icon: ShieldAlert,
    },
    {
      label: "Medium",
      value: s.mediumCount,
      sublabel: "risks",
      tone: "neutral",
      Icon: Activity,
    },
    {
      label: "Open",
      value: s.openCount,
      sublabel: "items",
      tone: s.openCount ? "warn" : "neutral",
      Icon: List,
    },
    {
      label: "Mitigating",
      value: s.mitigatingCount,
      sublabel: "in progress",
      tone: s.mitigatingCount ? "good" : "neutral",
      Icon: TrendingDown,
    },
    {
      label: "Exposure",
      value: fmtMoney(s.totalExposure),
      sublabel: "est. margin at risk",
      tone: s.totalExposure > 50_000 ? "danger" : s.totalExposure > 0 ? "warn" : "neutral",
      Icon: DollarSign,
    },
  ];

  const columns: Column<FlatRisk>[] = [
    {
      key: "label",
      header: "Risk",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.label}</div>
          {r.detail ? (
            <div className="cmd-row__meta" style={{ marginTop: 2 }}>{r.detail}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (r) => <span className="cmd-row__meta">{r.category}</span>,
    },
    {
      key: "severity",
      header: "Severity",
      render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>,
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      render: (r) =>
        r.exposure > 0 ? (
          <span className="cmd-row__num">{fmtMoney(r.exposure)}</span>
        ) : (
          <span className="cmd-row__meta">—</span>
        ),
    },
    {
      key: "mitigation",
      header: "Status",
      render: (r) =>
        r.mitigationStatus ? (
          <Pill tone={mitigationTone(r.mitigationStatus)}>{r.mitigationStatus}</Pill>
        ) : (
          <span className="cmd-row__meta">Active</span>
        ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (r) => r.owner ? <span>{r.owner}</span> : <span className="cmd-row__meta">—</span>,
    },
  ];

  return (
    <div className="risk-cc">
      <PageHero
        Icon={ShieldAlert}
        title="Risk Control Center"
        subtitle="Deterministic margin-at-risk analysis across open RFIs, submittals, deliveries, schedule, and field constraints."
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoSrc}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: Top Risks by score (highest urgency first) */}
        <DecisionPanel title="Top Risks by Score" onViewAll={scrollToTable}>
          {s.topByScore.map((r) => (
            <div className="cmd-row" key={r.id}>
              <div style={{ minWidth: 0 }}>
                <div className="cmd-row__num"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </div>
                <div className="cmd-row__meta">{r.category}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>
                {r.exposure > 0 && (
                  <span className="cmd-row__num" style={{ fontSize: 11 }}>
                    {fmtMoney(r.exposure)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {s.topByScore.length === 0 && (
            <div className="cmd-row__meta">No active risk items.</div>
          )}
        </DecisionPanel>

        {/* Panel 2: By Category */}
        <DecisionPanel title="By Category" onViewAll={scrollToTable}>
          {s.byCategory.map((cat) => (
            <div className="cmd-row" key={cat.category}>
              <div>
                <div className="cmd-row__num">{cat.category}</div>
                <div className="cmd-row__meta">
                  {cat.count} item{cat.count !== 1 ? "s" : ""}
                  {cat.criticalCount > 0 && ` · ${cat.criticalCount} critical`}
                </div>
              </div>
              {cat.totalExposure > 0 && (
                <span className="cmd-row__num" style={{ flexShrink: 0, fontSize: 11 }}>
                  {fmtMoney(cat.totalExposure)}
                </span>
              )}
            </div>
          ))}
          {s.byCategory.length === 0 && (
            <div className="cmd-row__meta">No risk items.</div>
          )}
        </DecisionPanel>

        {/* Panel 3: Needs Mitigation (high/critical, no owner, no status) */}
        <DecisionPanel title="Needs Mitigation" onViewAll={scrollToTable}>
          {s.needsMitigation.map((r) => (
            <div className="cmd-row" key={r.id}>
              <div style={{ minWidth: 0 }}>
                <div
                  className="cmd-row__num"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {r.label}
                </div>
                <div className="cmd-row__meta">{r.category}</div>
              </div>
              <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>
            </div>
          ))}
          {s.needsMitigation.length === 0 && (
            <div className="cmd-row__meta">All high-risk items have an owner or are in progress.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search risk label, category, or detail"
        onExport={onExport}
        primaryLabel={undefined}
        onPrimary={null}
        filters={
          <>
            {BASE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cmd-chip-btn${categoryFilter === cat ? " is-active" : ""}`}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage="No risk items match your filters."
      />
    </div>
  );
}
