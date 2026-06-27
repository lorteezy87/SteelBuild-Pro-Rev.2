import React, { useState } from "react";
import { formatCurrency, formatDate } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR, safeNumber, agingTintBg } from "../utils";
import { DrawerTile, drawerTd, drawerTdRight, FinancialDrawer } from "../DrawerAtoms";

// ── DSO (Days Sales Outstanding) Detail Drawer (Phase 4 Step 5) ─────
//
// Aging tint colors for outstanding invoice rows. Subtle ~3% opacity so the
// cue is visible but never garish. Uses color-mix so the tint adapts to
// whichever theme is active (light/dark) via CSS custom properties.
export function DSODrawer({ open, onClose, kpi, sovItems }) {
  const [outSortCol, setOutSortCol] = useState("daysOutstanding");
  const [outSortDir, setOutSortDir] = useState("desc");
  const [cmpSortCol, setCmpSortCol] = useState("submitted_date");
  const [cmpSortDir, setCmpSortDir] = useState("desc");

  if (!open) return null;

  const barColor = HEALTH_COLOR[kpi.health] || HEALTH_COLOR.amber;
  const outstanding = kpi.outstandingInvoices || [];

  // ── Completed cycles: SOV items with BOTH dates set ──
  const completedCycles = (sovItems || [])
    .filter(item => item.submitted_date && item.payment_received_date)
    .map(item => {
      const submitted = new Date(item.submitted_date);
      const paid = new Date(item.payment_received_date);
      const dtp = Math.max(0, Math.round((paid - submitted) / 86400000));
      return {
        ...item,
        _daysToPayment: dtp,
        _scheduled: safeNumber(item.scheduled_value),
      };
    });

  // ── Sort helpers (separate state per table) ──
  const makeSortFn = (col, dir) => (a, b) => {
    const aVal = a[col] ?? "";
    const bVal = b[col] ?? "";
    const numA = Number(aVal);
    const numB = Number(bVal);
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      return dir === "asc" ? numA - numB : numB - numA;
    }
    const sA = String(aVal).toLowerCase();
    const sB = String(bVal).toLowerCase();
    if (sA < sB) return dir === "asc" ? -1 : 1;
    if (sA > sB) return dir === "asc" ? 1 : -1;
    return 0;
  };

  const sortedOutstanding = [...outstanding].sort(makeSortFn(outSortCol, outSortDir));
  const sortedCompleted = [...completedCycles].sort(makeSortFn(cmpSortCol, cmpSortDir));

  const renderTh = (col, label, activeCol, activeDir, toggleFn, right = false) => (
    <th
      key={col}
      onClick={() => toggleFn(col)}
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        color: activeCol === col ? "var(--accent)" : "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        padding: "8px 6px",
        textAlign: right ? "right" : "left",
        cursor: "pointer",
        userSelect: "none",
        borderBottom: "1px solid var(--divider)",
        whiteSpace: "nowrap",
      }}
    >
      {label}{activeCol === col ? (activeDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  const toggleOutSort = (col) => {
    if (outSortCol === col) setOutSortDir(d => d === "asc" ? "desc" : "asc");
    else { setOutSortCol(col); setOutSortDir("desc"); }
  };
  const toggleCmpSort = (col) => {
    if (cmpSortCol === col) setCmpSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCmpSortCol(col); setCmpSortDir("desc"); }
  };

  // ── Header status line ──
  const headerStatus = outstanding.length > 0
    ? `${outstanding.length} OUTSTANDING`
    : kpi.avgDSO != null
      ? "ALL CURRENT"
      : "INSUFFICIENT DATA";

  // ── Cash Impact context message (per spec rule hierarchy) ──
  let contextMessage;
  if (outstanding.length === 0 && completedCycles.length === 0) {
    contextMessage = "No billing history yet — DSO will populate as pay apps are submitted and paid.";
  } else if (outstanding.length === 0 && completedCycles.length > 0) {
    contextMessage = `All invoices current. Avg ${Math.round(kpi.avgDSO)} days to payment across completed cycles.`;
  } else if (kpi.oldestOutstandingDays != null && kpi.oldestOutstandingDays > 90) {
    contextMessage = `Cash risk — oldest invoice is ${kpi.oldestOutstandingDays}d past submission. Escalate.`;
  } else if (kpi.oldestOutstandingDays != null && kpi.oldestOutstandingDays > 60) {
    contextMessage = `Aging concern — monitor oldest invoices closely.`;
  } else {
    const avgOut = outstanding.reduce((s, i) => s + i.daysOutstanding, 0) / Math.max(1, outstanding.length);
    contextMessage = `${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} outstanding, avg ${Math.round(avgOut)}d waiting.`;
  }

  // ── Conditional warning banner — only when oldest outstanding > 60 days ──
  const showWarningBanner = kpi.oldestOutstandingDays != null && kpi.oldestOutstandingDays > 60;

  return (
    <FinancialDrawer
      open={open}
      onClose={onClose}
      barColor={barColor}
      title="Days Sales Outstanding"
      subtitle={`${kpi.health.toUpperCase()} — ${headerStatus}`}
    >

          {/* ── Oldest Outstanding Warning Banner (conditional, first element) ── */}
          {showWarningBanner && (
            <div style={{
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              border: "1px solid var(--status-error)",
              borderLeft: "4px solid var(--status-error)",
              borderRadius: "var(--radius-card)",
              padding: "12px 14px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <div style={{
                ...mono, fontSize: 28, fontWeight: 700,
                color: "var(--status-error)", lineHeight: 1, flexShrink: 0,
              }}>
                {kpi.oldestOutstandingDays}d
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)",
                  letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2,
                }}>
                  OLDEST OUTSTANDING INVOICE
                </div>
                <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  Escalate immediately — {kpi.oldestOutstandingDays} days past submission
                </div>
              </div>
            </div>
          )}

          {/* Summary tiles — 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <DrawerTile
              label="Avg DSO"
              value={kpi.avgDSO != null ? `${Math.round(kpi.avgDSO)}d` : "—"}
              sub={completedCycles.length > 0 ? `${completedCycles.length} completed cycle${completedCycles.length === 1 ? "" : "s"}` : "No history"}
              accent={barColor}
            />
            <DrawerTile
              label="Median DSO"
              value={kpi.medianDSO != null ? `${Math.round(kpi.medianDSO)}d` : "—"}
              sub="Robust to outliers"
              accent="var(--accent)"
            />
            <DrawerTile
              label="Outstanding"
              value={String(outstanding.length)}
              sub={outstanding.length === 0 ? "All current" : `oldest ${kpi.oldestOutstandingDays ?? 0}d`}
              accent={outstanding.length === 0 ? "var(--status-success)" : barColor}
            />
            <DrawerTile
              label="Total Outstanding"
              value={formatCurrency(kpi.totalOutstandingValue || 0)}
              sub="At risk"
              accent="var(--status-warning)"
            />
          </div>

          {/* Cash Impact callout */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderLeft: `4px solid ${barColor}`,
            borderRadius: "var(--radius-card)",
            padding: "14px",
            marginBottom: 16,
          }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              CASH IMPACT
            </div>
            <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: barColor, lineHeight: 1.1, marginBottom: 8 }}>
              {formatCurrency(kpi.totalOutstandingValue || 0)}
            </div>
            <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>
              {contextMessage}
            </div>
          </div>

          {/* Outstanding Invoices table */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
              OUTSTANDING INVOICES ({sortedOutstanding.length})
            </div>
            {sortedOutstanding.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("application_number", "App #", outSortCol, outSortDir, toggleOutSort)}
                      {renderTh("submitted_date", "Submitted", outSortCol, outSortDir, toggleOutSort)}
                      {renderTh("daysOutstanding", "Days Out", outSortCol, outSortDir, toggleOutSort, true)}
                      {renderTh("scheduledValue", "Sched", outSortCol, outSortDir, toggleOutSort, true)}
                      {renderTh("currentBillingValue", "Billing", outSortCol, outSortDir, toggleOutSort, true)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOutstanding.map(inv => (
                      <tr key={inv.sov_id} style={{ background: agingTintBg(inv.daysOutstanding) }}>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{inv.application_number ?? "—"}</span>
                        </td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10 }}>{formatDate(inv.submitted_date)}</span>
                        </td>
                        <td style={drawerTdRight}>
                          <span style={{
                            ...mono, fontSize: 11, fontWeight: 700,
                            color: inv.daysOutstanding > 60
                              ? "var(--status-error)"
                              : inv.daysOutstanding > 30
                                ? "var(--status-warning)"
                                : "var(--text-primary)",
                          }}>
                            {inv.daysOutstanding}d
                          </span>
                        </td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(inv.scheduledValue))}</td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(inv.currentBillingValue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  No outstanding invoices
                </div>
              </div>
            )}
          </div>

          {/* Completed Cycles table */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
              COMPLETED CYCLES ({sortedCompleted.length})
            </div>
            {sortedCompleted.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("application_number", "App #", cmpSortCol, cmpSortDir, toggleCmpSort)}
                      {renderTh("submitted_date", "Submitted", cmpSortCol, cmpSortDir, toggleCmpSort)}
                      {renderTh("payment_received_date", "Paid", cmpSortCol, cmpSortDir, toggleCmpSort)}
                      {renderTh("_daysToPayment", "DTP", cmpSortCol, cmpSortDir, toggleCmpSort, true)}
                      {renderTh("_scheduled", "Sched", cmpSortCol, cmpSortDir, toggleCmpSort, true)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCompleted.map(c => (
                      <tr key={c.id}>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{c.application_number ?? "—"}</span>
                        </td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10 }}>{formatDate(c.submitted_date)}</span>
                        </td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10 }}>{formatDate(c.payment_received_date)}</span>
                        </td>
                        <td style={drawerTdRight}>
                          <span style={{ ...mono, fontSize: 11, fontWeight: 700 }}>{c._daysToPayment}d</span>
                        </td>
                        <td style={drawerTdRight}>{formatCurrency(c._scheduled)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  No completed billing cycles
                </div>
                <div style={{ ...body, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  DSO will populate as invoices are paid
                </div>
              </div>
            )}
          </div>
    </FinancialDrawer>
  );
}
