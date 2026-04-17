import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useFinancials } from "@/hooks/useFinancials";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import PageHeader from "@/components/shared/PageHeader";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "@/components/shared/PhoenixTable";
import { formatCurrency, formatCurrencyShort, formatPercent, formatBudgetPercent, formatDate } from "@/components/shared/formatters";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";

const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

const VIEW_TABS = [
  { key: "summary", label: "Project Summary" },
  { key: "sov", label: "SOV Analysis" },
  { key: "budget", label: "Budget Control" },
  { key: "unmapped", label: "Unmapped Costs" },
];

// SOV family rules aligned with cost code categories (costCodes.jsx)
// Each rule maps SOV descriptions → the matching cost code category
const FAMILY_RULES = [
  { key: "labor",         label: "Labor",         direct: true,  test: (text) => /shop labor|shop|fabrication|fab |field labor|structural|erect|install|shipping|freight|truck/.test(text) },
  { key: "materials",     label: "Materials",      direct: true,  test: (text) => /anchor bolt|embed|joist|deck\b|raw material|material|fastener|steel|plate|angle|channel/.test(text) },
  { key: "subcontractor", label: "Subcontractor",  direct: true,  test: (text) => /detail|engineering|deck install|subcontract|sub /.test(text) },
  { key: "equipment",     label: "Equipment",      direct: true,  test: (text) => /equipment|crane|forklift|rigging|scaffold/.test(text) },
  { key: "misc",          label: "Misc.",           direct: true,  test: (text) => /coat|galv|paint|special coat|misc|sundry/.test(text) },
  { key: "overhead",      label: "Overhead",        direct: false, test: (text) => /pm\/admin|admin|overhead|indirect|insurance|bond|travel|hotel|per diem/.test(text) },
];

function getFamilyMeta(text) {
  const normalized = String(text || "").toLowerCase();
  const match = FAMILY_RULES.find((rule) => rule.test(normalized));
  return match || { key: "misc", label: "Misc.", direct: true };
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatSigned(value) {
  if (value == null || value === "") return "\u2014";
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "\u2014";
  if (raw === 0) return "$0";
  return `${raw > 0 ? "+" : ""}${formatCurrency(raw)}`;
}

function varianceColor(value) {
  if (value < 0) return "var(--status-error)";
  if (value > 0) return "var(--status-success)";
  return "var(--text-muted)";
}

function SummaryCard({ label, value, detail, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        borderTop: `2px solid ${tone}`,
      }}
    >
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: tone, marginBottom: 4 }}>
        {value}
      </div>
      {detail ? <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{detail}</div> : null}
    </div>
  );
}

// ── Health color mapping ────────────────────────────────────────────────
const HEALTH_COLOR = {
  green: "var(--status-success)",
  amber: "var(--status-warning)",
  red:   "var(--status-error)",
};

// ── Executive KPI Card ──────────────────────────────────────────────────
function KPICard({ title, primary, supporting, health, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const handleKeyDown = (e) => {
    // Space/Enter activate the card like a button. preventDefault on Space
    // stops the page from scrolling.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title} — open detail drawer`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "var(--bg-surface-low)" : "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: `4px solid ${HEALTH_COLOR[health] || HEALTH_COLOR.amber}`,
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        cursor: "pointer",
        transition: "background 0.15s",
        minWidth: 0,
        outline: focused ? "2px solid var(--accent)" : "none",
        outlineOffset: focused ? "2px" : 0,
      }}
    >
      <div style={{
        fontFamily: "'Space Grotesk', var(--font-display)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        ...mono,
        fontSize: 24,
        fontWeight: 700,
        color: HEALTH_COLOR[health] || "var(--text-primary)",
        lineHeight: 1.1,
        marginBottom: 6,
      }}>
        {primary}
      </div>
      <div style={{
        ...mono,
        fontSize: 11,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
      }}>
        {supporting}
      </div>
    </div>
  );
}

// ── KPI Skeleton (shown while useFinancials is loading) ──────────────
function KPISkeleton() {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderLeft: "4px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      padding: "14px 16px",
    }}>
      <div style={{ width: 80, height: 10, borderRadius: 4, background: "var(--hover-bg)", marginBottom: 10 }} />
      <div style={{ width: 60, height: 22, borderRadius: 4, background: "var(--hover-bg)", marginBottom: 8 }} />
      <div style={{ width: "90%", height: 10, borderRadius: 4, background: "var(--hover-bg)" }} />
    </div>
  );
}

// ── KPI Strip — four executive cards ─────────────────────────────────
function KPIStrip({ kpis, loading, onCardClick }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPISkeleton /><KPISkeleton /><KPISkeleton /><KPISkeleton />
      </div>
    );
  }

  const { changeOrderImpact: co, laborUtilization: lab, billingVsCost: bvc, daysSalesOutstanding: dso } = kpis;

  // ── Card 1: CO Impact ──
  const coGrowth = co.contractGrowthPercent != null
    ? `+${co.contractGrowthPercent.toFixed(1)}%`
    : "\u2014";
  const coSupport = co.approved.count > 0 || co.pending.count > 0
    ? `${co.approved.count} approved \u00b7 ${co.pending.count} pending \u00b7 avg margin ${co.approved.avgMarginPercent.toFixed(1)}%`
    : "No change orders";

  // ── Card 2: Labor Utilization ──
  const labPrimary = lab.utilizationRatio != null
    ? lab.utilizationRatio.toFixed(2)
    : "\u2014";
  const overrideBadge = lab.percentScopeCompleteSource === "override"
    ? " \u00b7 OVERRIDE"
    : "";
  const labSupport = lab.utilizationRatio != null
    ? `${lab.percentLaborConsumed.toFixed(1)}% consumed \u00b7 ${lab.percentScopeComplete.toFixed(1)}% complete${overrideBadge} \u00b7 overrun ${lab.projectedOverrun != null ? formatCurrencyShort(lab.projectedOverrun) : "\u2014"}`
    : "Insufficient data";

  // ── Card 3: Billing / Cost ──
  const bvcPrimary = bvc.ratio != null
    ? bvc.ratio.toFixed(2)
    : "\u2014";
  const bvcSupport = bvc.ratio != null
    ? `${bvc.position} \u00b7 ${bvc.overUnderDollars >= 0 ? "+" : ""}${formatCurrencyShort(bvc.overUnderDollars)}`
    : "Insufficient data";

  // ── Card 4: DSO ──
  const dsoPrimary = dso.avgDSO != null
    ? `${Math.round(dso.avgDSO)}d`
    : "\u2014";
  const dsoSupport = dso.outstandingInvoices.length > 0 || dso.avgDSO != null
    ? `${dso.outstandingInvoices.length} outstanding \u00b7 oldest ${dso.oldestOutstandingDays != null ? `${dso.oldestOutstandingDays}d` : "\u2014"} \u00b7 ${formatCurrencyShort(dso.totalOutstandingValue)}`
    : "No billing data";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      <KPICard title="CO Impact"          primary={coGrowth}   supporting={coSupport}  health={co.health}  onClick={() => onCardClick("co")} />
      <KPICard title="Labor Utilization"  primary={labPrimary} supporting={
        <span>
          {lab.utilizationRatio != null ? (
            <>
              {lab.percentLaborConsumed.toFixed(1)}% consumed &middot; {lab.percentScopeComplete.toFixed(1)}% complete
              {lab.percentScopeCompleteSource === "override" && (
                <span style={{
                  display: "inline-block",
                  marginLeft: 4,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "'Space Grotesk', var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                  verticalAlign: "middle",
                }}>OVERRIDE</span>
              )}
              <br />overrun {lab.projectedOverrun != null ? formatCurrencyShort(lab.projectedOverrun) : "\u2014"}
            </>
          ) : (
            <em style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Insufficient data</em>
          )}
        </span>
      } health={lab.health} onClick={() => onCardClick("labor")} />
      <KPICard title="Billing / Cost"    primary={bvcPrimary} supporting={bvcSupport} health={bvc.health} onClick={() => onCardClick("billing")} />
      <KPICard title="DSO"               primary={dsoPrimary} supporting={dsoSupport} health={dso.health} onClick={() => onCardClick("dso")} />
    </div>
  );
}

// ── Drawer sub-components ───────────────────────────────────────────
function DrawerTile({ label, value, sub, accent = "var(--accent)" }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      padding: "10px 12px",
      borderTop: `2px solid ${accent}`,
    }}>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1.2, marginBottom: 2 }}>
        {value}
      </div>
      {sub && <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function ChartLegend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

const drawerTd = {
  ...body,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "7px 6px",
  borderBottom: "1px solid var(--divider)",
  whiteSpace: "nowrap",
};
const drawerTdRight = { ...drawerTd, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 };

// ── CO Impact Detail Drawer ─────────────────────────────────────────
function COImpactDrawer({ open, onClose, kpi, changeOrders: allCOs, selectedProject }) {
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
      {label}{sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
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
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{c.co_number || "—"}</span></td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "—"}</td>
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
                        <td style={drawerTd}><span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{c.co_number || "—"}</span></td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "—"}</td>
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

// ── Labor Utilization Detail Drawer (Phase 4 Step 3) ────────────────
function LaborDrawer({ open, onClose, kpi, selectedProject }) {
  const drawerRef = useRef(null);
  const qc = useQueryClient();
  const [sortCol, setSortCol] = useState("revised_budget");
  const [sortDir, setSortDir] = useState("desc");

  // Scope override inline edit state
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [inputError, setInputError] = useState(null);

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  // Reset edit state when switching projects or closing
  useEffect(() => {
    setEditing(false);
    setDraftValue("");
    setInputError(null);
  }, [selectedProject?.id, open]);

  // Atomic mutation: sets BOTH scope_complete_pct_override + scope_complete_pct_override_date
  // in a single update call. Cache invalidation triggers useFinancials refetch → no page reload.
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => base44.entities.Project.update(id, data),
    onSuccess: async () => {
      // Invalidate all project-shaped queries — useFinancials hook + local Financials page
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["project"] });
      setEditing(false);
      setDraftValue("");
      setInputError(null);
      toast.success("Scope % override updated");
    },
    onError: (err) => {
      setInputError(err.message);
      toast.error(`Failed to save override: ${err.message}`);
    },
  });

  if (!open) return null;

  const barColor = HEALTH_COLOR[kpi.health] || HEALTH_COLOR.amber;
  const rows = kpi.laborRows || [];

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

  const sortedRows = [...rows].sort(sortFn);

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

  // Override handlers
  const onEdit = () => {
    const pre = kpi.overridePct != null ? kpi.overridePct : kpi.evmDerivedPct;
    setDraftValue(Number.isFinite(pre) ? pre.toFixed(1) : "");
    setEditing(true);
    setInputError(null);
  };

  const onSave = () => {
    const value = parseFloat(draftValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setInputError("Must be a number between 0 and 100");
      return;
    }
    if (!selectedProject?.id) {
      setInputError("No project selected");
      return;
    }
    updateMut.mutate({
      id: selectedProject.id,
      data: {
        scope_complete_pct_override: value,
        scope_complete_pct_override_date: new Date().toISOString().split("T")[0],
      },
    });
  };

  const onCancel = () => {
    setEditing(false);
    setDraftValue("");
    setInputError(null);
  };

  const onClear = () => {
    if (!selectedProject?.id) return;
    updateMut.mutate({
      id: selectedProject.id,
      data: {
        scope_complete_pct_override: null,
        scope_complete_pct_override_date: null,
      },
    });
  };

  const isOverrideActive = kpi.percentScopeCompleteSource === "override";
  const overrideDate = selectedProject?.scope_complete_pct_override_date;

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
              Labor Utilization
            </div>
            <div style={{
              ...mono, fontSize: 9, color: barColor, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
            }}>
              {kpi.health.toUpperCase()} — {kpi.utilizationRatio != null ? `${kpi.utilizationRatio.toFixed(2)} RATIO` : "INSUFFICIENT DATA"}
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
            <DrawerTile label="Labor Budget" value={formatCurrency(kpi.laborBudget)} sub={`${rows.length} code${rows.length === 1 ? "" : "s"}`} accent="var(--accent)" />
            <DrawerTile label="Labor Actual" value={formatCurrency(kpi.laborActual)} sub={`${kpi.percentLaborConsumed.toFixed(1)}% consumed`} accent="var(--status-warning)" />
            <DrawerTile label="% Consumed" value={`${kpi.percentLaborConsumed.toFixed(1)}%`} sub={`of ${formatCurrencyShort(kpi.laborBudget)} budget`} accent="var(--status-info)" />
            <DrawerTile
              label="Utilization Ratio"
              value={kpi.utilizationRatio != null ? kpi.utilizationRatio.toFixed(2) : "—"}
              sub={
                kpi.utilizationRatio != null
                  ? (kpi.utilizationRatio > 1.1 ? "Overburn" : kpi.utilizationRatio > 1.0 ? "Slight overburn" : "On track")
                  : "No scope data"
              }
              accent={barColor}
            />
          </div>

          {/* ── Scope % Override Inline Control ── */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            borderLeft: `3px solid ${isOverrideActive ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-card)", padding: "14px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                SCOPE % COMPLETE
              </div>
              {isOverrideActive && !editing && (
                <span style={{
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "'Space Grotesk', var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                }}>OVERRIDE</span>
              )}
            </div>

            {/* Effective value (big) */}
            <div style={{
              ...mono, fontSize: 22, fontWeight: 700,
              color: isOverrideActive ? "var(--accent)" : "var(--text-primary)",
              marginBottom: 10, lineHeight: 1.1,
            }}>
              {kpi.percentScopeComplete.toFixed(1)}%
            </div>

            {/* Both sources always visible for transparency */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...body, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)" }}>EVM derived (from work packages)</span>
                <span style={{ ...mono, color: "var(--text-secondary)" }}>{kpi.evmDerivedPct.toFixed(1)}%</span>
              </div>
              {kpi.overridePct != null && (
                <div style={{ display: "flex", justifyContent: "space-between", ...body, fontSize: 11 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    PM override{overrideDate ? ` (set ${formatDate(overrideDate)})` : ""}
                  </span>
                  <span style={{ ...mono, color: "var(--accent)", fontWeight: 700 }}>{kpi.overridePct.toFixed(1)}%</span>
                </div>
              )}
            </div>

            {/* Edit / Save / Cancel / Clear controls */}
            {!editing ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={onEdit}
                  disabled={updateMut.isPending || !selectedProject?.id}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    background: "var(--accent-muted)",
                    border: "1px solid var(--accent-border)",
                    borderRadius: "var(--radius-btn)",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: updateMut.isPending ? "default" : "pointer",
                    opacity: updateMut.isPending ? 0.6 : 1,
                  }}
                >
                  {isOverrideActive ? "Edit Override" : "Set Override"}
                </button>
                {isOverrideActive && (
                  <button
                    onClick={onClear}
                    disabled={updateMut.isPending}
                    style={{
                      padding: "7px 12px",
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-btn)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: updateMut.isPending ? "default" : "pointer",
                      opacity: updateMut.isPending ? 0.6 : 1,
                    }}
                  >
                    {updateMut.isPending ? "..." : "Clear"}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={draftValue}
                    onChange={(e) => { setDraftValue(e.target.value); setInputError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); onSave(); }
                      // stopPropagation so Escape cancels edit without bubbling
                      // to the drawer's Escape-closes-drawer handler.
                      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
                    }}
                    autoFocus
                    disabled={updateMut.isPending}
                    style={{
                      flex: 1,
                      background: "var(--bg-input)",
                      border: `1px solid ${inputError ? "var(--status-error)" : "var(--border-default)"}`,
                      borderRadius: "var(--radius-input)",
                      padding: "8px 10px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  />
                  <span style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>%</span>
                </div>
                {inputError && (
                  <div style={{ ...mono, fontSize: 9, color: "var(--status-error)", marginBottom: 6 }}>
                    {inputError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={onSave}
                    disabled={updateMut.isPending}
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-btn)",
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: updateMut.isPending ? "default" : "pointer",
                      opacity: updateMut.isPending ? 0.6 : 1,
                    }}
                  >
                    {updateMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onCancel}
                    disabled={updateMut.isPending}
                    style={{
                      padding: "7px 12px",
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-btn)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Projection panel */}
          {kpi.projectedFinalLaborCost != null && (
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
                PROJECTION AT COMPLETION
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Projected final labor cost</span>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatCurrency(kpi.projectedFinalLaborCost)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Projected overrun vs. budget</span>
                <span style={{
                  ...mono, fontSize: 12, fontWeight: 700,
                  color: kpi.projectedOverrun > 0 ? "var(--status-error)" : "var(--status-success)",
                }}>
                  {kpi.projectedOverrun >= 0 ? "+" : ""}{formatCurrency(kpi.projectedOverrun)}
                </span>
              </div>
            </div>
          )}

          {/* Per-code labor breakdown table */}
          {sortedRows.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                LABOR COST BREAKDOWN ({sortedRows.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("cost_code_number", "Code")}
                      {renderTh("description", "Description")}
                      {renderTh("revised_budget", "Budget", true)}
                      {renderTh("actual_cost", "Actual", true)}
                      {renderTh("used_pct", "Used %", true)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(r => (
                      <tr key={r.id}>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{r.cost_code_number || "—"}</span>
                        </td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.description || "—"}
                        </td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(r.revised_budget))}</td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(r.actual_cost))}</td>
                        <td style={{
                          ...drawerTdRight,
                          color: r.used_pct > 100 ? "var(--status-error)" : r.used_pct > 85 ? "var(--status-warning)" : "var(--text-primary)",
                        }}>
                          {safeNumber(r.used_pct).toFixed(1)}%
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
                No labor cost codes configured
              </div>
              <div style={{ ...body, fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Labor codes are identified by the cost code catalog (codes 06, 07, 08, 10).
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

// ── Billing vs. Cost Detail Drawer (Phase 4 Step 4) ─────────────────
const SOV_STATUS_COLORS = {
  "Draft":     "var(--text-muted)",
  "Submitted": "var(--status-info)",
  "Certified": "var(--accent)",
  "Paid":      "var(--status-success)",
};

function periodDisplay(from, to) {
  const fmt = (d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const f = from ? fmt(from) : "";
  const t = to ? fmt(to) : "";
  if (f && t) return `${f} – ${t}`;
  return f || t || "—";
}

function BillingDrawer({ open, onClose, kpi, sovItems }) {
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

// ── DSO (Days Sales Outstanding) Detail Drawer (Phase 4 Step 5) ─────
//
// Aging tint colors for outstanding invoice rows. Subtle ~3% opacity so the
// cue is visible but never garish. Uses color-mix so the tint adapts to
// whichever theme is active (light/dark) via CSS custom properties.
function agingTintBg(daysOutstanding) {
  if (daysOutstanding <= 30) return "color-mix(in srgb, var(--status-success) 3%, transparent)";
  if (daysOutstanding <= 60) return "color-mix(in srgb, var(--status-warning) 3%, transparent)";
  return "color-mix(in srgb, var(--status-error) 3%, transparent)";
}

function DSODrawer({ open, onClose, kpi, sovItems }) {
  const drawerRef = useRef(null);
  const [outSortCol, setOutSortCol] = useState("daysOutstanding");
  const [outSortDir, setOutSortDir] = useState("desc");
  const [cmpSortCol, setCmpSortCol] = useState("submitted_date");
  const [cmpSortDir, setCmpSortDir] = useState("desc");

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

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
              Days Sales Outstanding
            </div>
            <div style={{
              ...mono, fontSize: 9, color: barColor, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
            }}>
              {kpi.health.toUpperCase()} — {headerStatus}
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

function SectionTabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)" }}>
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            background: "transparent",
            color: active === tab.key ? "var(--accent)" : "var(--text-muted)",
            border: "none",
            borderBottom: active === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: 0,
            padding: "8px 16px",
            marginBottom: -1,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: active === tab.key ? 700 : 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function FilterBar({ search, setSearch, filterPhase, setFilterPhase, phases }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search cost buckets, SOV lines, vendors, notes..."
        style={{
          minWidth: 280,
          flex: 1,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      />
      <select
        value={filterPhase}
        onChange={(event) => setFilterPhase(event.target.value)}
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
        }}
      >
        <option value="all">ALL COST CATEGORIES</option>
        {phases.map((phase) => (
          <option key={phase} value={phase}>
            {phase.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReviewFlags({ flags }) {
  return (
    <PhoenixPanel title="Review Flags" count={flags.length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px" }}>
        {flags.length === 0 ? (
          <div style={{ ...mono, fontSize: 9, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            No immediate financial flags
          </div>
        ) : (
          flags.map((flag) => (
            <div
              key={flag.title}
              style={{
                background: flag.tone === "error" ? "var(--danger-muted)" : "var(--warning-muted)",
                border: `1px solid ${flag.tone === "error" ? "var(--danger-border)" : "var(--warning-border)"}`,
                borderRadius: "var(--radius-card)",
                padding: "10px 12px",
              }}
            >
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: flag.tone === "error" ? "var(--status-error)" : "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                {flag.title}
              </div>
              <div style={{ ...body, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {flag.body}
              </div>
            </div>
          ))
        )}
      </div>
    </PhoenixPanel>
  );
}

export default function Financials() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("summary");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCostCode, setEditingCostCode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () => (projectId ? base44.entities.CostCode.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => (projectId ? base44.entities.ChangeOrder.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () => (projectId ? base44.entities.Expense.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => (projectId ? base44.entities.SOVItem.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const costCodeQueryKeys = [["cost-codes", projectId], ["cost-codes"]];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.CostCode.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, costCodeQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to create cost code"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostCode.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, costCodeQueryKeys, updated);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to update cost code"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.CostCode.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, costCodeQueryKeys, deletedId);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setDeleteTarget(null);
    },
    onError: (error) => toastCrudError(error, "Failed to delete cost code"),
  });

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;

  // ── Executive KPIs via useFinancials (Phase 4) ─────────────────────
  // Uses the centralized hook ONLY for the four KPI objects.
  // Existing local queries + calculations below are intentionally untouched.
  const {
    changeOrderImpact,
    laborUtilization,
    billingVsCost,
    daysSalesOutstanding,
    isLoading: kpiLoading,
  } = useFinancials(projectId, selectedProject);
  const [activeDrawer, setActiveDrawer] = useState(null);

  const approvedChangeOrders = useMemo(() => changeOrders.filter((changeOrder) => changeOrder.status === "Approved"), [changeOrders]);
  const activeExpenses = useMemo(() => expenses.filter((expense) => expense.payment_status !== "Voided"), [expenses]);

  const costCodeRows = useMemo(() => {
    const byCostCodeId = approvedChangeOrders.reduce((acc, changeOrder) => {
      const key = changeOrder.cost_code_id || "__unmapped__";
      if (!acc[key]) acc[key] = 0;
      acc[key] += safeNumber(changeOrder.co_amount);
      return acc;
    }, {});

    return costCodes.map((costCode) => {
      const relatedExpenses = activeExpenses.filter((expense) => expense.cost_code === costCode.cost_code_number || expense.cost_code_id === costCode.id);
      const actual = relatedExpenses
        .filter((expense) => expense.payment_status === "Paid")
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const committed = relatedExpenses.reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const signedExtras = safeNumber(byCostCodeId[costCode.id]);
      const originalBudget = safeNumber(costCode.budget_amount);
      const revisedBudget = originalBudget + signedExtras;
      const originalEstimate = originalBudget;
      // Committed already includes paid (actual) amounts — don't double-count
      const exposure = committed;
      const remainingBudget = revisedBudget - exposure;
      const usedPct = revisedBudget > 0 ? (exposure / revisedBudget) * 100 : 0;
      const family = getFamilyMeta(`${costCode.phase || ""} ${costCode.description || ""}`);

      return {
        ...costCode,
        actual_cost: actual,
        committed_cost: committed,
        signed_extras: signedExtras,
        original_estimate: originalEstimate,
        revised_budget: revisedBudget,
        exposure,
        remaining_budget: remainingBudget,
        used_pct: usedPct,
        family_label: family.label,
        direct_billable: family.direct,
      };
    });
  }, [activeExpenses, approvedChangeOrders, costCodes]);

  const families = useMemo(() => [...new Set(costCodeRows.map((row) => row.phase).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))), [costCodeRows]);
  const costCodeMap = useMemo(() => new Map(costCodeRows.map((row) => [row.cost_code_number, row])), [costCodeRows]);

  const filteredCostCodeRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return costCodeRows.filter((row) => {
      const phaseMatch = filterPhase === "all" || row.phase === filterPhase;
      if (!phaseMatch) return false;
      if (!q) return true;
      return [row.cost_code_number, row.description, row.phase, row.family_label].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [costCodeRows, filterPhase, search]);

  const groupedSovRows = useMemo(() => {
    const familyTotals = {};
    sovItems.forEach((item) => {
      const family = getFamilyMeta(item.description);
      if (!familyTotals[family.key]) {
        familyTotals[family.key] = { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      }
      familyTotals[family.key].scheduled += safeNumber(item.scheduled_value);
    });

    costCodeRows.forEach((row) => {
      const family = getFamilyMeta(`${row.phase || ""} ${row.description || ""}`);
      if (!familyTotals[family.key]) {
        familyTotals[family.key] = { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      }
      familyTotals[family.key].budget += safeNumber(row.revised_budget);
      familyTotals[family.key].actual += safeNumber(row.actual_cost);
      familyTotals[family.key].committed += safeNumber(row.committed_cost);
      familyTotals[family.key].remaining += safeNumber(row.remaining_budget);
    });

    return sovItems.map((item) => {
      const scheduledValue = safeNumber(item.scheduled_value);
      const family = getFamilyMeta(item.description);
      const totals = familyTotals[family.key] || { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      const share = totals.scheduled > 0 ? scheduledValue / totals.scheduled : 0;
      const percentOfContract = safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value) > 0
        ? (scheduledValue / safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value)) * 100
        : 0;
      const expenseActual = activeExpenses
        .filter((expense) => expense.sov_line_item_id === item.id)
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);

      return {
        ...item,
        family_label: family.label,
        direct_billable: family.direct,
        allocation_share: share,
        percent_of_contract: percentOfContract,
        allocated_budget: totals.budget * share,
        allocated_actual: expenseActual || totals.actual * share,
        allocated_committed: totals.committed * share,
        allocated_remaining: totals.remaining * share,
      };
    });
  }, [activeExpenses, costCodeRows, selectedProject, sovItems]);

  const filteredSovRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedSovRows.filter((row) => !q || [row.line_item_number, row.description, row.family_label].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [groupedSovRows, search]);

  const unmappedExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeExpenses
      .filter((expense) => {
        const costCode = expense.cost_code ? costCodeMap.get(expense.cost_code) : null;
        const isUnmapped = !expense.cost_code || !costCode;
        if (!isUnmapped) return false;
        if (!q) return true;
        return [expense.vendor, expense.description, expense.expense_type, expense.invoice_number, expense.cost_code].some((value) =>
          String(value || "").toLowerCase().includes(q)
        );
      })
      .map((expense) => ({
        ...expense,
        reason: !expense.cost_code ? "Missing cost code" : "Cost code not found in project budget",
      }));
  }, [activeExpenses, costCodeMap, search]);

  const summary = useMemo(() => {
    const contractValue = safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value);
    const sovTotal = sovItems.reduce((sum, item) => sum + safeNumber(item.scheduled_value), 0);
    const revisedBudget = costCodeRows.reduce((sum, row) => sum + safeNumber(row.revised_budget), 0);
    const actual = costCodeRows.reduce((sum, row) => sum + safeNumber(row.actual_cost), 0);
    const committed = costCodeRows.reduce((sum, row) => sum + safeNumber(row.committed_cost), 0);
    const exposure = costCodeRows.reduce((sum, row) => sum + safeNumber(row.exposure), 0);
    const remainingBudget = revisedBudget - exposure;
    const approvedExtras = approvedChangeOrders.reduce((sum, changeOrder) => sum + safeNumber(changeOrder.co_amount), 0);
    const budgetSpentPct = revisedBudget > 0 ? (exposure / revisedBudget) * 100 : 0;
    const sovVsContract = contractValue > 0 ? sovTotal - contractValue : 0;
    const marginAtRisk = contractValue - exposure;

    return {
      contractValue,
      sovTotal,
      sovVsContract,
      revisedBudget,
      actual,
      committed,
      exposure,
      remainingBudget,
      approvedExtras,
      budgetSpentPct,
      marginAtRisk,
    };
  }, [approvedChangeOrders, costCodeRows, selectedProject, sovItems]);

  const reviewFlags = useMemo(() => {
    const flags = [];
    if (Math.abs(summary.sovVsContract) > 1) {
      flags.push({
        title: "SOV mismatch",
        body: `Schedule of values totals ${formatSigned(summary.sovVsContract)} against the project contract. The workbook treats this as a review item before billing.`,
        tone: "warning",
      });
    }
    if (summary.remainingBudget < 0) {
      flags.push({
        title: "Budget overrun",
        body: `Current exposure exceeds revised budget by ${formatCurrency(Math.abs(summary.remainingBudget))}.`,
        tone: "error",
      });
    }
    if (unmappedExpenses.length > 0) {
      flags.push({
        title: "Unmapped costs",
        body: `${unmappedExpenses.length} expense ${unmappedExpenses.length === 1 ? "record needs" : "records need"} review before they can be tied to a billable SOV line.`,
        tone: "warning",
      });
    }
    const zeroCommitted = costCodeRows.filter((row) => row.committed_cost === 0 && row.actual_cost === 0 && row.revised_budget > 0);
    if (zeroCommitted.length > 0) {
      flags.push({
        title: "Committed cost gap",
        body: `${zeroCommitted.length} cost buckets have revised budget but no actual or committed cost. The spreadsheet treats this as a control check for missing POs or buyouts.`,
        tone: "warning",
      });
    }
    return flags;
  }, [costCodeRows, summary, unmappedExpenses.length]);

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
        <div style={{ ...body, fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>
          Select a project to view financial control
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)" }}>
          Use the project selector in the top right.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        title="Budget Control"
        subtitle={`${selectedProject?.name || "Project"} • workbook-style financial control`}
        onAdd={() => {
          setEditingCostCode(null);
          setModalOpen(true);
        }}
        onRefresh={() => {
          invalidateCrudQueries(qc, costCodeQueryKeys);
          qc.invalidateQueries({ queryKey: ["expenses", projectId] });
          qc.invalidateQueries({ queryKey: ["sov-items", projectId] });
          qc.invalidateQueries({ queryKey: ["change-orders", projectId] });
        }}
        addLabel="New Cost Code"
      />

      {/* ── Executive KPI Strip (Phase 4) ── */}
      <KPIStrip
        kpis={{ changeOrderImpact, laborUtilization, billingVsCost, daysSalesOutstanding }}
        loading={kpiLoading}
        onCardClick={(drawer) => setActiveDrawer(drawer)}
      />

      {reviewFlags.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "var(--danger-muted)",
          border: "1px solid var(--danger-border)",
          borderLeft: "4px solid var(--status-error)",
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
        }}>
          <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
            ⚑ {reviewFlags.length} FLAG{reviewFlags.length > 1 ? "S" : ""} REQUIRE REVIEW
          </span>
          {reviewFlags.map((flag) => (
            <div key={flag.title} style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: flag.tone === "error" ? "rgba(255,61,61,0.12)" : "rgba(245,158,11,0.12)",
              border: `1px solid ${flag.tone === "error" ? "rgba(255,61,61,0.30)" : "rgba(245,158,11,0.30)"}`,
              borderRadius: 4,
              padding: "3px 10px",
            }}>
              <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: flag.tone === "error" ? "var(--status-error)" : "var(--status-warning)", letterSpacing: "0.10em" }}>
                {flag.title.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      <SectionTabs active={activeView} onChange={setActiveView} />

      {costCodes.length === 0 && sovItems.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 14 }}>
          <div style={{ ...mono, fontSize: 48, opacity: 0.15, lineHeight: 1 }}>$</div>
          <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text-disabled)" }}>
            Awaiting SOV Upload
          </div>
          <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
            Add cost codes to build your budget, then upload a Schedule of Values to enable billing analysis and variance tracking.
          </div>
          <button
            onClick={() => { setEditingCostCode(null); setModalOpen(true); }}
            style={{
              marginTop: 8,
              padding: "9px 20px",
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-btn)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            + Add First Cost Code
          </button>
        </div>
      ) : (<>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <SummaryCard label="Contract Value" value={formatCurrencyShort(summary.contractValue)} detail={`Project ${selectedProject?.project_number || "—"}`} />
        <SummaryCard label="SOV Total" value={formatCurrencyShort(summary.sovTotal)} detail={`Variance to contract ${formatSigned(summary.sovVsContract)}`} tone={Math.abs(summary.sovVsContract) > 1 ? "var(--status-warning)" : "var(--accent)"} />
        <SummaryCard label="Revised Budget" value={formatCurrencyShort(summary.revisedBudget)} detail={`Approved extras ${formatCurrencyShort(summary.approvedExtras)}`} tone="var(--status-info)" />
        <SummaryCard label="Actual Cost" value={formatCurrencyShort(summary.actual)} detail={`Committed ${formatCurrencyShort(summary.committed)}`} tone="var(--status-warning)" />
        <SummaryCard label="Exposure" value={formatCurrencyShort(summary.exposure)} detail={`Budget used ${formatBudgetPercent(summary.budgetSpentPct, 1)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-warning)"} />
        <SummaryCard label="Budget Remaining" value={formatSigned(summary.remainingBudget)} detail={`Margin at risk ${formatCurrencyShort(summary.marginAtRisk)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <FilterBar search={search} setSearch={setSearch} filterPhase={filterPhase} setFilterPhase={setFilterPhase} phases={families} />

      {activeView === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: 16 }}>
          <PhoenixPanel title="Project Summary" count={selectedProject?.project_number || "—"}>
            <PhoenixTable
              columns={[
                { label: "Project" },
                { label: "Job #" },
                { label: "Manager" },
                { label: "Superintendent" },
                { label: "Contract", right: true },
                { label: "SOV Total", right: true },
                { label: "Revised Budget", right: true },
                { label: "Actual", right: true },
                { label: "Committed", right: true },
                { label: "Exposure", right: true },
                { label: "Remaining", right: true },
              ]}
            >
              <PTR>
                <PTD bold>{selectedProject?.name}</PTD>
                <PTD mono>{selectedProject?.project_number || "—"}</PTD>
                <PTD>{selectedProject?.project_manager || "—"}</PTD>
                <PTD>{selectedProject?.superintendent || "—"}</PTD>
                <PTD right mono>{formatCurrency(summary.contractValue)}</PTD>
                <PTD right mono>{formatCurrency(summary.sovTotal)}</PTD>
                <PTD right mono>{formatCurrency(summary.revisedBudget)}</PTD>
                <PTD right mono>{formatCurrency(summary.actual)}</PTD>
                <PTD right mono>{formatCurrency(summary.committed)}</PTD>
                <PTD right mono>{formatCurrency(summary.exposure)}</PTD>
                <PTD right mono style={{ color: varianceColor(summary.remainingBudget) }}>{formatSigned(summary.remainingBudget)}</PTD>
              </PTR>
            </PhoenixTable>
          </PhoenixPanel>

          <ReviewFlags flags={reviewFlags} />
        </div>
      )}

      {activeView === "sov" && (
        <PhoenixPanel title="SOV Analysis" count={filteredSovRows.length}>
          <PhoenixTable
            columns={[
              { label: "SOV Seq" },
              { label: "Description" },
              { label: "SOV Value", right: true },
              { label: "% Contract", right: true },
              { label: "Recommended Cost Family" },
              { label: "Alloc. Share", right: true },
              { label: "Allocated Revised Budget", right: true },
              { label: "Allocated Actual", right: true },
              { label: "Allocated Committed", right: true },
              { label: "Allocated Remaining", right: true },
            ]}
            empty="NO SOV ITEMS FOUND"
          >
            {filteredSovRows.map((row) => (
              <PTR key={row.id}>
                <PTD mono accent>{row.line_item_number || "—"}</PTD>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>{row.description || "—"}</PTD>
                <PTD right mono>{formatCurrency(row.scheduled_value)}</PTD>
                <PTD right mono>{formatPercent(row.percent_of_contract, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD right mono>{formatPercent(row.allocation_share * 100, 1)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_budget)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_actual)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_committed)}</PTD>
                <PTD right mono style={{ color: varianceColor(row.allocated_remaining) }}>{formatSigned(row.allocated_remaining)}</PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "budget" && (
        <PhoenixPanel title="Budget Control" count={filteredCostCodeRows.length}>
          <PhoenixTable
            columns={[
              { label: "Cost Bucket" },
              { label: "Original Estimate", right: true },
              { label: "Signed Extras", right: true },
              { label: "Revised Budget", right: true },
              { label: "Actual Cost", right: true },
              { label: "Committed Cost", right: true },
              { label: "Exposure", right: true },
              { label: "Remaining Budget", right: true },
              { label: "Used %", right: true },
              { label: "Suggested SOV Family" },
              { label: "Direct Billable?" },
              { label: "Actions", right: true },
            ]}
            empty="NO COST BUCKETS FOUND"
          >
            {filteredCostCodeRows.map((row) => (
              <PTR key={row.id} overdue={row.remaining_budget < 0} warn={row.used_pct > 85 && row.remaining_budget >= 0}>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>
                  <div style={{ ...mono, fontSize: 10, color: "var(--accent)", marginBottom: 2 }}>{row.cost_code_number || "—"}</div>
                  <div style={{ ...body, fontSize: 12, color: "var(--text-primary)" }}>{row.description || "—"}</div>
                  <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{row.phase || "Unassigned"}</div>
                </PTD>
                <PTD right mono>{formatCurrency(row.original_estimate)}</PTD>
                <PTD right mono>{formatSigned(row.signed_extras)}</PTD>
                <PTD right mono>{formatCurrency(row.revised_budget)}</PTD>
                <PTD right mono>{formatCurrency(row.actual_cost)}</PTD>
                <PTD right mono>{formatCurrency(row.committed_cost)}</PTD>
                <PTD right mono>{formatCurrency(row.exposure)}</PTD>
                <PTD right mono style={{ color: varianceColor(row.remaining_budget) }}>{formatSigned(row.remaining_budget)}</PTD>
                <PTD right mono style={{ color: row.used_pct > 100 ? "var(--status-error)" : row.used_pct > 85 ? "var(--status-warning)" : "var(--text-secondary)" }}>{formatBudgetPercent(row.used_pct, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD mono>{row.direct_billable ? "YES" : "REVIEW"}</PTD>
                <PTD right>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        // Strip computed display fields so they don't poison the save payload.
                        // Pass only the original DB record from costCodes array.
                        const dbRecord = costCodes.find((c) => c.id === row.id) || row;
                        setEditingCostCode(dbRecord);
                        setModalOpen(true);
                      }}
                      style={{
                        background: "var(--bg-surface-low)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)",
                        padding: "6px 8px",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(row);
                      }}
                      style={{
                        background: "var(--danger-muted)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: "var(--radius-btn)",
                        padding: "6px 8px",
                        color: "var(--status-error)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "unmapped" && (
        <PhoenixPanel title="Unmapped Costs" count={unmappedExpenses.length}>
          <PhoenixTable
            columns={[
              { label: "Expense #" },
              { label: "Vendor" },
              { label: "Description" },
              { label: "Amount", right: true },
              { label: "Status" },
              { label: "Cost Code" },
              { label: "Reason" },
              { label: "Invoice Date" },
            ]}
            empty="NO UNMAPPED COSTS FOUND"
          >
            {unmappedExpenses.map((expense) => (
              <PTR key={expense.id} warn>
                <PTD mono accent>{expense.expense_number || "—"}</PTD>
                <PTD>{expense.vendor || "—"}</PTD>
                <PTD style={{ maxWidth: 260, whiteSpace: "normal" }}>{expense.description || "—"}</PTD>
                <PTD right mono>{formatCurrency(expense.amount)}</PTD>
                <PTD mono>{expense.payment_status || "—"}</PTD>
                <PTD mono>{expense.cost_code || "—"}</PTD>
                <PTD>{expense.reason}</PTD>
                <PTD mono>{expense.invoice_date || "—"}</PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}
      </>)}

      <CostCodeFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCostCode(null);
        }}
        onSave={(data) => {
          const payload = { ...data, project_id: data.project_id || projectId };
          if (editingCostCode?.id) updateMut.mutate({ id: editingCostCode.id, data: payload });
          else createMut.mutate(payload);
        }}
        costCode={editingCostCode}
        projects={projects}
        existingCodes={costCodes}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Cost Code"
        description={`Delete ${deleteTarget?.cost_code_number || "cost code"}?`}
      />

      {/* ── CO Impact Detail Drawer (Phase 4 Step 2) ── */}
      <COImpactDrawer
        open={activeDrawer === "co"}
        onClose={() => setActiveDrawer(null)}
        kpi={changeOrderImpact}
        changeOrders={changeOrders}
        selectedProject={selectedProject}
      />

      {/* ── Labor Utilization Detail Drawer (Phase 4 Step 3) ── */}
      <LaborDrawer
        open={activeDrawer === "labor"}
        onClose={() => setActiveDrawer(null)}
        kpi={laborUtilization}
        selectedProject={selectedProject}
      />

      {/* ── Billing vs. Cost Detail Drawer (Phase 4 Step 4) ── */}
      <BillingDrawer
        open={activeDrawer === "billing"}
        onClose={() => setActiveDrawer(null)}
        kpi={billingVsCost}
        sovItems={sovItems}
      />

      {/* ── DSO Detail Drawer (Phase 4 Step 5) ── */}
      <DSODrawer
        open={activeDrawer === "dso"}
        onClose={() => setActiveDrawer(null)}
        kpi={daysSalesOutstanding}
        sovItems={sovItems}
      />
    </div>
  );
}
