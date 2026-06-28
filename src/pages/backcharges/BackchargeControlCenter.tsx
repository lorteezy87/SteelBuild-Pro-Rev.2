/**
 * BackchargeControlCenter — command_ui re-skin of the Backcharges page.
 *
 * Pure presentation: all data, mutations, and modal state live in the parent
 * Backcharges.jsx shell (same pattern as RfiControlCenter / RFIs.jsx).
 * No network calls. No business logic. Re-uses the canonical command kit
 * components and the backchargeControlCenter.derive.ts engine.
 */
import { useMemo } from "react";
import { ScrollText, DollarSign, AlertTriangle, ShieldCheck, FileWarning, TrendingDown, BarChart2 } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, statusTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildBackchargeSummary } from "./backchargeControlCenter.derive";
import type { Backcharge } from "./backchargeControlCenter.derive";
import {
  BACKCHARGE_STATUS_LABELS,
  BACKCHARGE_STATUSES,
} from "@/lib/backcharge/types";
import type { BackchargeStatus } from "@/lib/backcharge/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format a dollar amount for display (no cents unless non-zero). */
function fmtMoney(n: number): string {
  if (!n && n !== 0) return "$—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Derive a Pill tone from a backcharge status. */
function backchargeTone(status: string | null | undefined): ReturnType<typeof statusTone> {
  switch (status as BackchargeStatus) {
    case "draft":        return "neutral";
    case "notice_sent":  return "info";
    case "pending":      return "warn";
    case "disputed":     return "danger";
    case "approved":     return "good";
    case "rejected":     return "neutral";
    case "collected":    return "good";
    case "void":         return "neutral";
    default:             return "neutral";
  }
}

/** Indicates whether the backcharge has a defensible notice on record. */
function noticeCell(bc: Backcharge) {
  if (bc.notice_date) return <Pill tone="good">Notice on file</Pill>;
  return <Pill tone="warn">No notice</Pill>;
}

/** Scroll the full DataTable into view (mirrors the RFI pattern). */
function scrollToTable() {
  document.querySelector(".bc-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Status filter chips (All + each status) ───────────────────────────────

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  ...BACKCHARGE_STATUSES.map((s) => ({ label: BACKCHARGE_STATUS_LABELS[s], value: s })),
];

// ─── Props ──────────────────────────────────────────────────────────────────

export interface BackchargeControlCenterProps {
  projectName: string;
  backcharges: Backcharge[];
  filtered: Backcharge[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  onOpen: (bc: Backcharge) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BackchargeControlCenter(props: BackchargeControlCenterProps) {
  const {
    projectName, backcharges, filtered, search, onSearch,
    statusFilter, onStatusFilter, onOpen, onExport, onCreate,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildBackchargeSummary(backcharges), [backcharges]);

  // ── Hero chips
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.open} Open`, tone: s.open ? ("warn" as const) : ("good" as const) },
    { label: `${s.disputed} Disputed`, tone: s.disputed ? ("danger" as const) : ("neutral" as const) },
  ];

  // ── KPI strip (6 cells)
  const kpiCells: KpiCellDef[] = [
    {
      label: "Open Exposure",
      value: fmtMoney(s.openAmount),
      sublabel: "being chased",
      tone: s.openTone,
      Icon: DollarSign,
    },
    {
      label: "Total Logged",
      value: fmtMoney(s.totalAmount),
      sublabel: "all statuses",
      tone: "neutral",
      Icon: BarChart2,
    },
    {
      label: "Recovered",
      value: fmtMoney(s.recoveredAmount),
      sublabel: "collected",
      tone: s.recoveredAmount > 0 ? "good" : "neutral",
      Icon: TrendingDown,
    },
    {
      label: "Disputed",
      value: s.disputed,
      sublabel: "backcharges",
      tone: s.disputed ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Defense Ready",
      value: s.defenseReady,
      sublabel: "have notice date",
      tone: s.defenseReady === s.total && s.total > 0 ? "good" : s.defenseReady > 0 ? "warn" : "neutral",
      Icon: ShieldCheck,
    },
    {
      label: "Notice Rate",
      value: `${s.noticeRate}%`,
      sublabel: "contractual coverage",
      tone: s.noticeRate === 100 ? "good" : s.noticeRate > 50 ? "warn" : s.total > 0 ? "danger" : "neutral",
      Icon: FileWarning,
    },
  ];

  // ── DataTable columns
  const columns: Column<Backcharge>[] = [
    {
      key: "num",
      header: "BC #",
      render: (b) => (
        <span className="cmd-row__num">{b.backcharge_number || "—"}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (b) => b.title || "(untitled)",
    },
    {
      key: "vendor",
      header: "Responsible Party",
      render: (b) => b.responsible_party || "—",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (b) => (
        <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontWeight: 700 }}>
          {fmtMoney(Number(b.amount || 0))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <Pill tone={backchargeTone(b.status)}>
          {BACKCHARGE_STATUS_LABELS[b.status as BackchargeStatus] || b.status}
        </Pill>
      ),
    },
    {
      key: "notice",
      header: "Defense",
      render: noticeCell,
    },
    {
      key: "incident",
      header: "Incident Date",
      render: (b) => b.incident_date || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "notice_date",
      header: "Notice Date",
      render: (b) =>
        b.notice_date ? (
          b.notice_date
        ) : (
          <span className="cmd-row__meta" style={{ color: "var(--color-warn, #f59e0b)" }}>
            Missing
          </span>
        ),
    },
  ];

  return (
    <div className="bc-cc">
      <PageHero
        Icon={ScrollText}
        title="Backcharge Defense Control Center"
        subtitle="Log backcharges, build T&M cost packages, and generate defensible audit trails to recover costs from responsible parties."
        projectName={projectName}
        chips={chips}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: Open backcharges — highest exposure first */}
        <DecisionPanel
          title="Open Backcharges"
          onViewAll={() => { onStatusFilter("pending"); scrollToTable(); }}
        >
          {s.openQueue.map((b) => (
            <div
              className="cmd-row is-clickable"
              key={b.id}
              onClick={() => onOpen(b)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cmd-row__num">
                  {b.backcharge_number ? `${b.backcharge_number} · ` : ""}
                  {b.title}
                </div>
                <div className="cmd-row__meta">
                  {b.responsible_party || "Unknown"} · {BACKCHARGE_STATUS_LABELS[b.status as BackchargeStatus] || b.status}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <Pill tone={backchargeTone(b.status)}>
                  {fmtMoney(Number(b.amount || 0))}
                </Pill>
                {!b.notice_date && (
                  <Pill tone="warn">No notice</Pill>
                )}
              </div>
            </div>
          ))}
          {s.openQueue.length === 0 && (
            <div className="cmd-row__meta">No open backcharges.</div>
          )}
        </DecisionPanel>

        {/* Panel 2: Disputed backcharges — need attention */}
        <DecisionPanel
          title="Disputed"
          onViewAll={() => { onStatusFilter("disputed"); scrollToTable(); }}
        >
          {s.disputedQueue.map((d) => (
            <div
              className="cmd-row is-clickable"
              key={d.id}
              onClick={() => {
                const bc = backcharges.find((b) => b.id === d.id);
                if (bc) onOpen(bc);
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cmd-row__num">{d.title}</div>
                <div className="cmd-row__meta">
                  {d.responsible_party || "Unknown"} ·{" "}
                  {d.notice_date ? `notice ${d.notice_date}` : "no notice on record"}
                </div>
              </div>
              <Pill tone="danger">{fmtMoney(d.amount)}</Pill>
            </div>
          ))}
          {s.disputedQueue.length === 0 && (
            <div className="cmd-row__meta">No disputed backcharges.</div>
          )}
        </DecisionPanel>

        {/* Panel 3: By Vendor / Responsible Party */}
        <DecisionPanel title="By Responsible Party" onViewAll={scrollToTable}>
          {s.byVendor.map((v) => (
            <div className="cmd-row" key={v.vendor}>
              <div>
                <div className="cmd-row__num">{v.vendor}</div>
                <div className="cmd-row__meta">
                  {v.count} backcharge{v.count !== 1 ? "s" : ""} · {v.statuses.join(", ")}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontWeight: 700, fontSize: 13 }}>
                  {fmtMoney(v.totalAmount)}
                </div>
                {v.openAmount > 0 && (
                  <div className="cmd-row__meta">
                    {fmtMoney(v.openAmount)} open
                  </div>
                )}
              </div>
            </div>
          ))}
          {s.byVendor.length === 0 && (
            <div className="cmd-row__meta">No backcharges logged.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search title, responsible party, or backcharge number"
        onExport={onExport}
        primaryLabel="New Backcharge"
        onPrimary={onCreate || null}
        filters={
          <>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`cmd-chip-btn${statusFilter === f.value ? " is-active" : ""}`}
                onClick={() => onStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpen}
        emptyMessage="No backcharges match your filters."
      />
    </div>
  );
}
