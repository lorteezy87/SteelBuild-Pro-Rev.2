import React, { useState } from "react";
import { formatCurrency, formatCurrencyShort, formatDate } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR, safeNumber } from "../utils";
import { DrawerTile, ChartLegend, drawerTd, drawerTdRight, FinancialDrawer } from "../DrawerAtoms";

export function COImpactDrawer({ open, onClose, kpi, changeOrders: allCOs, selectedProject }) {
  const [sortCol, setSortCol] = useState("co_amount");
  const [sortDir, setSortDir] = useState("desc");

  if (!open) return null;

  const barColor = HEALTH_COLOR[kpi.health] || HEALTH_COLOR.amber;

  const approved = allCOs.filter(c => c.status === "Approved");
  const pending = allCOs.filter(c => ["Submitted", "Under Review"].includes(c.status));

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

  const sortedApproved = [...approved].sort(sortFn);
  const sortedPending = [...pending].sort(sortFn);

  const originalCV = safeNumber(selectedProject?.original_contract_value);
  const approvedVal = kpi.approved.totalValue;
  const pendingVal = kpi.pending.totalValue;
  const totalBar = originalCV + approvedVal + pendingVal;

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
      {label}{sortCol === col ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : ""}
    </th>
  );

  return (
    <FinancialDrawer
      open={open}
      onClose={onClose}
      barColor={barColor}
      title="Change Order Impact"
      subtitle={`${kpi.health.toUpperCase()} — ${kpi.approved.count} APPROVED, ${kpi.pending.count} PENDING`}
    >

          {/* Summary tiles — 2×2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <DrawerTile label="Approved" value={formatCurrency(kpi.approved.totalValue)} sub={`${kpi.approved.count} COs`} accent="var(--status-success)" />
            <DrawerTile label="Pending" value={formatCurrency(kpi.pending.totalValue)} sub={`${kpi.pending.count} COs`} accent="var(--status-warning)" />
            <DrawerTile label="Avg Margin" value={`${kpi.approved.avgMarginPercent.toFixed(1)}%`} sub={formatCurrency(kpi.approved.totalMarginDollars)} accent="var(--accent)" />
            <DrawerTile label="Contract Growth" value={`${kpi.contractGrowthPercent.toFixed(1)}%`} sub={`of ${formatCurrencyShort(originalCV)} original`} accent={barColor} />
          </div>

          {/* Contract progression chart */}
          {totalBar > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                CONTRACT PROGRESSION
              </div>
              <svg width="100%" height={28} style={{ display: "block", borderRadius: 4, overflow: "hidden" }}>
                <rect x="0" y="0" width={`${(originalCV / totalBar) * 100}%`} height="28" fill="var(--accent)" />
                {approvedVal > 0 && (
                  <rect x={`${(originalCV / totalBar) * 100}%`} y="0" width={`${(approvedVal / totalBar) * 100}%`} height="28" fill="var(--status-success)" />
                )}
                {pendingVal > 0 && (
                  <rect x={`${((originalCV + approvedVal) / totalBar) * 100}%`} y="0" width={`${(pendingVal / totalBar) * 100}%`} height="28" fill="var(--status-warning)" opacity="0.5" />
                )}
              </svg>
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <ChartLegend color="var(--accent)" label={`Original ${formatCurrencyShort(originalCV)}`} />
                <ChartLegend color="var(--status-success)" label={`Approved +${formatCurrencyShort(approvedVal)}`} />
                {pendingVal > 0 && <ChartLegend color="var(--status-warning)" label={`Pending +${formatCurrencyShort(pendingVal)}`} />}
              </div>
            </div>
          )}

          {/* Margin summary panel */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)", padding: "12px 14px", marginBottom: 16,
          }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              MARGIN SUMMARY
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Approved margin captured</span>
              <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{formatCurrency(kpi.approved.totalMarginDollars)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Pending margin potential</span>
              <span style={{ ...mono, fontSize: 12, fontWeight: 600, color: "var(--status-warning)" }}>{formatCurrency(kpi.pending.totalMarginDollars)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Margin impact on contract</span>
              <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{kpi.marginImpactOnContract.toFixed(1)}%</span>
            </div>
          </div>

          {/* Approved COs table */}
          {sortedApproved.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                APPROVED ({sortedApproved.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("co_number", "CO #")}
                      {renderTh("title", "Title")}
                      {renderTh("co_amount", "Amount", true)}
                      {renderTh("margin_percent", "Margin %", true)}
                      {renderTh("approved_date", "Approved")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedApproved.map(c => (
                      <tr key={c.id}>
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{c.co_number || "\u2014"}</span></td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "\u2014"}</td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(c.co_amount))}</td>
                        <td style={drawerTdRight}>{safeNumber(c.margin_percent).toFixed(1)}%</td>
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10 }}>{formatDate(c.approved_date)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending COs table */}
          {sortedPending.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                PENDING ({sortedPending.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("co_number", "CO #")}
                      {renderTh("title", "Title")}
                      {renderTh("co_amount", "Amount", true)}
                      {renderTh("margin_percent", "Margin %", true)}
                      {renderTh("status", "Status")}
                      {renderTh("submitted_date", "Submitted")}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPending.map(c => (
                      <tr key={c.id}>
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{c.co_number || "\u2014"}</span></td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "\u2014"}</td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(c.co_amount))}</td>
                        <td style={drawerTdRight}>{safeNumber(c.margin_percent).toFixed(1)}%</td>
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 9, color: "var(--status-warning)" }}>{c.status}</span></td>
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10 }}>{formatDate(c.submitted_date)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rejected summary line */}
          {kpi.rejected.count > 0 && (
            <div style={{
              ...mono, fontSize: 9, color: "var(--text-muted)", padding: "8px 0",
              borderTop: "1px solid var(--divider)",
            }}>
              {kpi.rejected.count} rejected/void — {formatCurrency(kpi.rejected.totalValue)} total value
            </div>
          )}

          {/* Empty state */}
          {approved.length === 0 && pending.length === 0 && kpi.rejected.count === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                No change orders recorded
              </div>
            </div>
          )}
    </FinancialDrawer>
  );
}
