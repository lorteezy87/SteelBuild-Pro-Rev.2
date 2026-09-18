/**
 * PayApplicationsControlCenter — canonical Pay Applications presentation.
 *
 * The parent (PayApplications.jsx) owns all data, mutations, and modal state
 * and passes them down. This component is pure presentation: no network calls,
 * no state beyond what the command kit needs.
 *
 * Money contract: every value received from the parent is in DOLLARS (the
 * money.ts convention — integer-cent math at the boundary, stored/passed as
 * JS numbers). We display via the imported `formatMoney` helper from the derive
 * module (which delegates to money.ts). Never call `.toLocaleString()` on raw
 * dollar fields directly.
 */
import { useMemo } from "react";
import { Download, Plus } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
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

  const operationalMetrics = [
    { label: "Pending Payment", value: formatMoney(s.pendingPaymentDue), sublabel: "submitted + approved", tone: s.pendingPaymentDue > 0 ? "warn" as const : "neutral" as const },
    { label: "Total Paid", value: formatMoney(s.totalPaid), sublabel: "paid apps", tone: "good" as const },
    { label: "Retainage Held", value: formatMoney(s.retainageHeld), sublabel: "withheld to date", tone: s.retainageHeld > 0 ? "warn" as const : "neutral" as const },
    { label: "Balance to Finish", value: formatMoney(s.balanceToFinish), sublabel: "remaining on contract", tone: "neutral" as const },
    { label: "% Complete", value: `${s.percentComplete}%`, sublabel: "earned / contract", tone: s.percentComplete >= 90 ? "good" as const : s.percentComplete >= 50 ? "info" as const : "neutral" as const },
    { label: "Applications", value: s.total, sublabel: `${s.draftCount} draft · ${s.submittedCount} submitted · ${s.approvedCount} approved`, tone: "neutral" as const },
  ];

  const attentionItems: AttentionItem[] = q.awaitingAction.map((app) => ({
    id: String(app.id || app.application_number),
    issue: `App #${app.application_number} · ${fmtPeriod(app)}`,
    deadline: app.period_to || null,
    risk: `${statusLabel(app.status)} · ${formatMoney(app.current_payment_due)} due`,
    owner: app.status === "submitted" ? "External approval" : null,
    nextAction: app.status === "submitted" ? "Advance approval" : "Advance payment / closeout",
    tone: app.status === "submitted" ? "warn" : "info",
    onOpen: () => onOpen(app),
  }));

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
    <div className="payapp-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Commercial`}
        title="Pay Applications"
        subtitle="Monthly billing execution, retainage, payment status, and balance to finish."
        meta={`${s.total} applications · ${formatMoney(s.pendingPaymentDue)} pending · ${s.percentComplete}% complete`}
        actions={(
          <>
            {onExport ? <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}><Download size={14} /> Export</button> : null}
            {canCreate && onCreate ? <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}><Plus size={14} /> New Application</button> : null}
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Pay application operational summary" />

      <AttentionQueue
        title="Billing Attention"
        items={attentionItems}
        emptyMessage="No pay applications are currently awaiting action."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>By Status</h2></div>
          <div>
            {q.byStatus.length === 0 ? <div className="sbp-attention__empty">No pay applications yet.</div> : q.byStatus.map((row) => (
              <button type="button" className="cmd-row is-clickable" key={row.status} onClick={() => { onStatusFilter(row.status); scrollToTable(); }} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div><Pill tone={payAppStatusTone(row.status)}>{row.label}</Pill><div className="cmd-row__meta">{row.count} app{row.count === 1 ? "" : "s"}</div></div>
                <span className="cmd-row__num">{formatMoney(row.total)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Recent Applications</h2></div>
          <div>
            {q.recent.length === 0 ? <div className="sbp-attention__empty">No applications yet.</div> : q.recent.map((app) => (
              <button type="button" className="cmd-row is-clickable" key={app.id} onClick={() => onOpen(app)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div><div className="cmd-row__num">App #{app.application_number}</div><div className="cmd-row__meta">{fmtPeriod(app)}</div></div>
                <div style={{ textAlign: "right" }}><div>{formatMoney(app.current_payment_due)}</div><div className="cmd-row__meta">{statusLabel(app.status)}</div></div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search application number, period, or notes"
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
