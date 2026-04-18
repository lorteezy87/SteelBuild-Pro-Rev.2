import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency, formatCurrencyShort, formatDate } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR, safeNumber } from "../utils";
import { DrawerTile, ChartLegend, drawerTd, drawerTdRight } from "../DrawerAtoms";

export function COImpactDrawer({ open, onClose, kpi, changeOrders: allCOs, selectedProject }) {
  const drawerRef = useRef(null);
  const [sortCol, setSortCol] = useState("co_amount");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

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
              Change Order Impact
            </div>
            <div style={{
              ...mono, fontSize: 9, color: barColor, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
            }}>
              {kpi.health.toUpperCase()} — {kpi.approved.count} APPROVED, {kpi.pending.count} PENDING
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
