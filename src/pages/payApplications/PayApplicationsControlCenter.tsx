/**
 * PayApplicationsControlCenter — Command UI skin for the Pay Applications page.
 *
 * Rendered only when the `command_ui` feature flag is on. The parent
 * (PayApplications.jsx) owns all data, mutations, and modal state and passes
 * them down. This component is pure-presentation: no network calls, no state
 * beyond what the command kit needs.
 *
 * Money contract: every value received from the parent is in DOLLARS (the
 * money.ts convention — integer-cent math at the boundary, stored/passed as
 * JS numbers). We display via the imported `formatMoney` helper from the derive
 * module (which delegates to money.ts). Never call `.toLocaleString()` on raw
 * dollar fields directly.
 */
import { useMemo } from "react";
import { ReceiptText, DollarSign, Clock, CheckCircle, AlertTriangle, Percent } from "lucide-react";
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
import { photoFor } from "@/config/launcherConfig";
import {
  buildPayAppSummary,
  buildPayAppPanelQueues,
  payAppStatusTone,
  fmtPeriod,
  formatMoney,
  PAY_APP_STATUS_LABELS,
} from "./payApplicationsControlCenter.derive";
import type { PayApplication } from "@/lib/payapp/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scroll the full DataTable into view when a panel fires "View all". */
function scrollToTable() {
  document.querySelector(".payapp-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Draft";
  return PAY_APP_STATUS_LABELS[status as keyof typeof PAY_APP_STATUS_LABELS] || status;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PayApplicationsControlCenterProps {
  projectName: string;
  payApps: PayApplication[];
  /** Filtered list driven by the parent's search/status state. */
  filtered: PayApplication[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  onOpen: (app: PayApplication) => void;
  onExport?: (() => void) | null;
  onCreate?: (() => void) | null;
  canCreate: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PayApplicationsControlCenter(props: PayApplicationsControlCenterProps) {
  const {
    projectName,
    payApps,
    filtered,
    search,
    onSearch,
    statusFilter,
    onStatusFilter,
    onOpen,
    onExport,
    onCreate,
    canCreate,
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildPayAppSummary(payApps), [payApps]);
  const q = useMemo(() => buildPayAppPanelQueues(payApps), [payApps]);

  // Hero chips: counts for quick at-a-glance
  const chips = [
    { label: `${s.total} Total` },
    ...(s.submittedCount ? [{ label: `${s.submittedCount} Submitted`, tone: "info" as const }] : []),
    ...(s.approvedCount  ? [{ label: `${s.approvedCount} Approved`,  tone: "good" as const }] : []),
  ];

  const heroStats = [
    { value: formatMoney(s.pendingPaymentDue), label: "Pending Payment" },
    { value: `${s.percentComplete}%`, label: "% Complete" },
  ];

  // KPI strip — 6 cells
  const kpiCells: KpiCellDef[] = [
    {
      label: "Pending Payment",
      value: formatMoney(s.pendingPaymentDue),
      sublabel: "submitted + approved",
      tone: s.pendingPaymentDue > 0 ? "warn" : "neutral",
      Icon: DollarSign,
    },
    {
      label: "Total Paid",
      value: formatMoney(s.totalPaid),
      sublabel: "paid apps",
      tone: "good",
      Icon: CheckCircle,
    },
    {
      label: "Retainage Held",
      value: formatMoney(s.retainageHeld),
      sublabel: "withheld to date",
      tone: s.retainageHeld > 0 ? "warn" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Balance to Finish",
      value: formatMoney(s.balanceToFinish),
      sublabel: "remaining on contract",
      tone: "neutral",
      Icon: Clock,
    },
    {
      label: "% Complete",
      value: `${s.percentComplete}%`,
      sublabel: "earned / contract",
      tone: s.percentComplete >= 90 ? "good" : s.percentComplete >= 50 ? "info" : "neutral",
      Icon: Percent,
    },
    {
      label: "Applications",
      value: s.total,
      sublabel: `${s.draftCount}d · ${s.submittedCount}s · ${s.approvedCount}a`,
      tone: "neutral",
      Icon: ReceiptText,
    },
  ];

  // DataTable columns — real fields only
  const columns: Column<PayApplication>[] = [
    {
      key: "num",
      header: "App #",
      render: (a) => (
        <span className="cmd-row__num">#{a.application_number}</span>
      ),
    },
    {
      key: "period",
      header: "Billing Period",
      render: (a) => fmtPeriod(a),
    },
    {
      key: "amount",
      header: "Payment Due",
      align: "right",
      render: (a) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatMoney(a.current_payment_due)}
        </span>
      ),
    },
    {
      key: "completed",
      header: "Completed & Stored",
      align: "right",
      render: (a) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {a.total_completed_stored != null ? formatMoney(a.total_completed_stored) : "—"}
        </span>
      ),
    },
    {
      key: "retainage",
      header: "Retainage",
      align: "right",
      render: (a) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {a.total_retainage != null ? formatMoney(a.total_retainage) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (a) => (
        <Pill tone={payAppStatusTone(a.status)}>{statusLabel(a.status)}</Pill>
      ),
    },
    {
      key: "period_to",
      header: "Period End",
      render: (a) => a.period_to || <span className="cmd-row__meta">—</span>,
    },
  ];

  const STATUS_FILTERS = [
    { key: "all",       label: "All" },
    { key: "draft",     label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "approved",  label: "Approved" },
    { key: "paid",      label: "Paid" },
    { key: "void",      label: "Void" },
  ];

  return (
    <div className="payapp-cc">
      <PageHero
        Icon={ReceiptText}
        title="Pay Applications Control Center"
        subtitle="AIA G702/G703 pay applications — track billing periods, retainage, and payment status."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("PayApplications") ?? undefined}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: Awaiting action (submitted or approved) */}
        <DecisionPanel
          title="Awaiting Action"
          onViewAll={() => { onStatusFilter("submitted"); scrollToTable(); }}
        >
          {q.awaitingAction.length === 0 ? (
            <div className="cmd-row__meta">No applications awaiting action.</div>
          ) : (
            q.awaitingAction.map((a) => (
              <div
                className="cmd-row is-clickable"
                key={a.id}
                onClick={() => onOpen(a)}
              >
                <div>
                  <div className="cmd-row__num">App #{a.application_number}</div>
                  <div className="cmd-row__meta">{fmtPeriod(a)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill tone={payAppStatusTone(a.status)}>{statusLabel(a.status)}</Pill>
                  <span
                    className="cmd-row__num"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatMoney(a.current_payment_due)}
                  </span>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2: By status breakdown */}
        <DecisionPanel title="By Status" onViewAll={scrollToTable}>
          {q.byStatus.length === 0 ? (
            <div className="cmd-row__meta">No pay applications yet.</div>
          ) : (
            q.byStatus.map((b) => (
              <div
                className="cmd-row is-clickable"
                key={b.status}
                onClick={() => { onStatusFilter(b.status); scrollToTable(); }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill tone={payAppStatusTone(b.status)}>{b.label}</Pill>
                  <span className="cmd-row__meta">{b.count} app{b.count !== 1 ? "s" : ""}</span>
                </div>
                <span
                  className="cmd-row__num"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatMoney(b.total)}
                </span>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3: Recent applications */}
        <DecisionPanel title="Recent Applications" onViewAll={scrollToTable}>
          {q.recent.length === 0 ? (
            <div className="cmd-row__meta">No applications yet.</div>
          ) : (
            q.recent.map((a) => (
              <div
                className="cmd-row is-clickable"
                key={a.id}
                onClick={() => onOpen(a)}
              >
                <div>
                  <div className="cmd-row__num">App #{a.application_number}</div>
                  <div className="cmd-row__meta">{fmtPeriod(a)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span
                    className="cmd-row__num"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatMoney(a.current_payment_due)}
                  </span>
                  <Pill tone={payAppStatusTone(a.status)}>{statusLabel(a.status)}</Pill>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search application number, period, or notes"
        onExport={onExport ?? undefined}
        primaryLabel="New Application"
        onPrimary={canCreate && onCreate ? onCreate : null}
        filters={
          <>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`cmd-chip-btn${statusFilter === f.key ? " is-active" : ""}`}
                onClick={() => onStatusFilter(f.key)}
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
        emptyMessage="No pay applications match your filters."
      />
    </div>
  );
}
