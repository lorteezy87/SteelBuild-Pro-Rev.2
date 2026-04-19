import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency, formatDate } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR, safeNumber, periodDisplay } from "../utils";
import { DrawerTile, drawerTd, drawerTdRight } from "../DrawerAtoms";

const SOV_STATUS_COLORS = {
  "Draft":     "var(--text-muted)",
  "Submitted": "var(--status-info)",
  "Certified": "var(--accent)",
  "Paid":      "var(--status-success)",
};

export function BillingDrawer({ open, onClose, kpi, sovItems }) {
  const drawerRef = useRef(null);
  const [sortCol, setSortCol] = useState("application_number");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const barColor = HEALTH_COLOR[kpi.health] || HEALTH_COLOR.amber;

  // ── Per-row derived fields (billed-to-date, DTP/days-outstanding) ──
  // DTP encoding:
  //   positive → days from submitted to payment (paid)
  //   negative → days outstanding (submitted, not yet paid) — displayed in amber
  //   null     → not submitted yet
  const today = Date.now();
  const enrichedRows = sovItems.map(item => {
    const scheduled = safeNumber(item.scheduled_value);
    const curPct = safeNumber(item.current_percent_complete);
    const billedToDate = scheduled * curPct / 100;

    let dtp = null;
    if (item.submitted_date && item.payment_received_date) {
      const s = new Date(item.submitted_date);
      const p = new Date(item.payment_received_date);
      dtp = Math.max(0, Math.round((p - s) / 86400000));
    } else if (item.submitted_date) {
      const s = new Date(item.submitted_date);
      dtp = -Math.max(0, Math.round((today - s) / 86400000));
    }

    return {
      ...item,
      _scheduled: scheduled,
      _curPct: curPct,
      _billedToDate: billedToDate,
      _daysToPayment: dtp,
      _period: periodDisplay(item.period_from, item.period_to),
    };
  });

  const sortFn = (a, b) => {
    const aVal = a[sortCol] ?? "";
    const bVal = b[sortCol] ?? "";
    const numA = Number(aVal);
    const numB = Number(bVal);
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      return sortDir === "asc" ? numA - numB : numB - numA;
    }
    const sA = String(aVal).toLowerCase();
    const sB = String(bVal).toLowerCase();
    if (sA < sB) return sortDir === "asc" ? -1 : 1;
    if (sA > sB) return sortDir === "asc" ? 1 : -1;
    return 0;
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortedRows = [...enrichedRows].sort(sortFn);

  const renderTh = (col, label, right = false) => (
    <th
      key={col}
      onClick={() => toggleSort(col)}
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        color: sortCol === col ? "var(--accent)" : "var(--text-muted)",
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
      {label}{sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  // ── Position label + context message keyed off ratio ──────────────
  // Mirrors the health thresholds defined in useFinancials.billingVsCost.
  let positionLabel, positionMessage;
  if (kpi.ratio == null) {
    positionLabel   = "Insufficient data";
    positionMessage = "No cost data yet — can't compute billing position.";
  } else if (kpi.ratio > 1.2) {
    positionLabel   = "Over-billed";
    positionMessage = "Heavily front-loaded — schedule risk if GC notices.";
  } else if (kpi.ratio > 1.1) {
    positionLabel   = "Over-billed";
    positionMessage = "Over-billed drift — monitor GC review.";
  } else if (kpi.ratio >= 1.0) {
    positionLabel   = "Over-billed";
    positionMessage = "Billings ahead of cost — healthy cash position.";
  } else if (kpi.ratio >= 0.9) {
    positionLabel   = "Under-billed";
    positionMessage = "Billings trail cost — potential cash flow drag.";
  } else {
    positionLabel   = "Under-billed";
    positionMessage = "Under-billed — financing project out of pocket.";
  }
  // Balance detection (1.02 over, 0.98 under) uses the same tolerance as the KPI's `position` field.
  if (kpi.position === "balanced") positionLabel = "Balanced";

  // Static comparison bar — scale by max of the two values
  const maxBar = Math.max(kpi.cumulativeBillings, kpi.cumulativeCost, 1);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: 0, right: 0, width: 480, maxWidth: "90vw",
          height: "100vh", background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)", zIndex: 1101,
          display: "flex", flexDirection: "column", outline: "none",
        }}
      >
        {/* Fixed header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "16px 20px", borderBottom: "1px solid var(--divider)", flexShrink: 0,
        }}>
          <div style={{ width: 4, height: 28, borderRadius: 2, background: barColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk', var(--font-display)",
              fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
            }}>
              Billing vs. Cost
            </div>
            <div style={{
              ...mono, fontSize: 9, color: barColor, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
            }}>
              {kpi.health.toUpperCase()} — {positionLabel.toUpperCase()}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)",
              cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Summary tiles — 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <DrawerTile
              label="Cumulative Billings"
              value={formatCurrency(kpi.cumulativeBillings)}
              sub={`${sovItems.length} SOV item${sovItems.length === 1 ? "" : "s"}`}
              accent="var(--accent)"
            />
            <DrawerTile
              label="Cumulative Cost"
              value={formatCurrency(kpi.cumulativeCost)}
              sub="Paid expenses"
              accent="var(--status-warning)"
            />
            <DrawerTile
              label="Ratio"
              value={kpi.ratio != null ? kpi.ratio.toFixed(2) : "—"}
              sub={kpi.overUnderPercent != null
                ? `${kpi.overUnderPercent >= 0 ? "+" : ""}${kpi.overUnderPercent.toFixed(1)}% vs. cost`
                : "No cost data"}
              accent={barColor}
            />
            <DrawerTile
              label="Position"
              value={
                <span style={{
                  fontFamily: "'Space Grotesk', var(--font-display)",
                  fontSize: 14, fontWeight: 700, color: barColor, lineHeight: 1.2,
                }}>
                  {positionLabel}
                </span>
              }
              sub={kpi.ratio != null ? `ratio ${kpi.ratio.toFixed(2)}` : "—"}
              accent={barColor}
            />
          </div>

          {/* Over/Under callout */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderLeft: `4px solid ${barColor}`,
            borderRadius: "var(--radius-card)",
            padding: "14px",
            marginBottom: 16,
          }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              CASH FLOW POSITION
            </div>
            <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: barColor, lineHeight: 1.1, marginBottom: 4 }}>
              {kpi.overUnderDollars >= 0 ? "+" : ""}{formatCurrency(kpi.overUnderDollars)}
            </div>
            <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
              {kpi.overUnderPercent != null
                ? `${kpi.overUnderPercent >= 0 ? "+" : ""}${kpi.overUnderPercent.toFixed(1)}% vs. cumulative cost`
                : "No cost recorded"}
            </div>
            <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>
              {positionMessage}
            </div>
          </div>

          {/* Comparison bar — static dual bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              BILLINGS vs. COST
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>BILLINGS</span>
                  <span style={{ ...mono, fontSize: 11, color: "var(--text-primary)" }}>{formatCurrency(kpi.cumulativeBillings)}</span>
                </div>
                <div style={{ height: 10, background: "var(--bg-surface-low)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(kpi.cumulativeBillings / maxBar) * 100}%`, background: "var(--accent)", transition: "width 0.3s" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.08em" }}>COST</span>
                  <span style={{ ...mono, fontSize: 11, color: "var(--text-primary)" }}>{formatCurrency(kpi.cumulativeCost)}</span>
                </div>
                <div style={{ height: 10, background: "var(--bg-surface-low)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(kpi.cumulativeCost / maxBar) * 100}%`, background: "var(--status-warning)", transition: "width 0.3s" }} />
                </div>
              </div>
            </div>
          </div>

          {/* SOV items table */}
          {sortedRows.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                SOV ITEMS ({sortedRows.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      {renderTh("application_number", "App #")}
                      {renderTh("_period", "Period")}
                      {renderTh("_scheduled", "Sched", true)}
                      {renderTh("_curPct", "% Cmpl", true)}
                      {renderTh("_billedToDate", "Billed", true)}
                      {renderTh("submitted_date", "Submitted")}
                      {renderTh("payment_received_date", "Paid")}
                      {renderTh("_daysToPayment", "DTP", true)}
                      {renderTh("status", "Status")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(r => (
                      <tr key={r.id}>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{r.application_number ?? "—"}</span>
                        </td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>{r._period}</span>
                        </td>
                        <td style={drawerTdRight}>{formatCurrency(r._scheduled)}</td>
                        <td style={drawerTdRight}>{r._curPct.toFixed(1)}%</td>
                        <td style={drawerTdRight}>{formatCurrency(r._billedToDate)}</td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 9 }}>{r.submitted_date ? formatDate(r.submitted_date) : "—"}</span>
                        </td>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 9 }}>{r.payment_received_date ? formatDate(r.payment_received_date) : "—"}</span>
                        </td>
                        <td style={drawerTdRight}>
                          {r._daysToPayment == null
                            ? <span style={{ color: "var(--text-muted)" }}>—</span>
                            : r._daysToPayment < 0
                              ? <span style={{ color: "var(--status-warning)" }}>{Math.abs(r._daysToPayment)}d out</span>
                              : <span style={{ color: "var(--text-primary)" }}>{r._daysToPayment}d</span>}
                        </td>
                        <td style={drawerTd}>
                          <span style={{
                            ...mono,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: SOV_STATUS_COLORS[r.status] || "var(--text-muted)",
                          }}>{r.status || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                No SOV items recorded
              </div>
            </div>
          )}
        </div>

        {/* Pinned footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 8, flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            flex: 1, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
            borderRadius: 4, padding: "8px 16px", color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer",
          }}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
