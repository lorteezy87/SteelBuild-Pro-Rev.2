import React, { useState } from "react";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { formatDate, formatCurrencyWhole, formatCurrencyShort, safePct } from "@/components/shared/formatters";
import { CommandBar, Button } from "@/components/design-system";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import SOVFormModal from "@/components/sov/SOVFormModal";
import { Pencil, Trash2 } from "lucide-react";
import {
  CONTRACT_TABS,
  deriveBillingSov,
  deriveChangeOrders,
  deriveContractSummary,
} from "@/pages/contractManagement/contractManagement.derive";
import { ContractOverviewPanel as ContractOverviewSection } from "@/pages/contractManagement/ContractOverviewPanel";
import { useContractManagement } from "@/pages/contractManagement/useContractManagement";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { usePermissions } from "@/services/permissions";

const fmt = formatCurrencyWhole;
const fmtShort = (v) => formatCurrencyShort(v);

// ─── Inline components ──────────────────────────────────────────────────────

const KPICard = ({ label, value, sub, tone }) => (
  <div className="sbd-kpi" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
    <span className="sbd-kpi-label" style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
    <span className="sbd-kpi-value sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: tone || "var(--text-primary)" }}>{value}</span>
    {sub && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{sub}</span>}
  </div>
);

const COStatusBadge = ({ status }) => {
  const colors = {
    Draft: { bg: "rgba(128,128,128,0.15)", border: "rgba(128,128,128,0.3)", text: "var(--text-muted)" },
    Submitted: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", text: "var(--status-info)" },
    "Under Review": { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", text: "var(--status-warning)" },
    Approved: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", text: "var(--status-success)" },
    Rejected: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", text: "var(--status-error)" },
    Certified: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", text: "var(--status-success)" },
    Paid: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", text: "var(--status-info)" },
  };
  const c = colors[status] || colors.Draft;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 3, background: c.bg, border: `1px solid ${c.border}`, fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: c.text }}>{status}</span>
  );
};

// ─── Table cell/row styles ──────────────────────────────────────────────────
const thStyle = {
  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-muted)", padding: "10px 12px",
  textAlign: "left", borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
};

const tdStyle = {
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)",
  padding: "10px 12px", borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
};

const tdBodyStyle = {
  ...tdStyle, fontFamily: "var(--font-body)", whiteSpace: "normal", maxWidth: 260,
};

const tdRightStyle = { ...tdStyle, textAlign: "right" };

const totalsStyle = {
  ...tdStyle, fontWeight: 800, borderTop: "2px solid var(--accent)", borderBottom: "none",
};

// ─── Tab button ─────────────────────────────────────────────────────────────
const TabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? "var(--accent)" : "transparent",
      color: active ? "var(--bg-base)" : "var(--text-muted)",
      border: active ? "1px solid var(--accent)" : "1px solid var(--border-default)",
      borderRadius: "var(--radius-btn)",
      padding: "6px 16px",
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      cursor: "pointer",
      transition: "all 0.15s ease",
    }}
  >
    {label}
  </button>
);

// ─── Progress bar ───────────────────────────────────────────────────────────
const ProgressBar = ({ value, height = 6 }) => {
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  const color = v >= 90 ? "var(--status-success)" : v >= 50 ? "var(--status-warning)" : "var(--accent)";
  return (
    <div style={{ width: "100%", height, background: "var(--divider)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s ease" }} />
    </div>
  );
};

// ─── Change Orders Tab ──────────────────────────────────────────────────────
function ChangeOrdersTab({ changeOrders }) {
  const { rows: cos, totals } = deriveChangeOrders(changeOrders);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KPICard label="Total Change Orders" value={totals.total} sub={`${fmt(totals.approved + totals.pending + totals.rejected)} total value`} />
        <KPICard label="Approved Total" value={fmt(totals.approved)} tone="var(--status-success)" />
        <KPICard label="Pending Total" value={fmt(totals.pending)} tone="var(--status-warning)" sub="Draft + Submitted + Under Review" />
        <KPICard label="Rejected" value={totals.rejectedCount} tone="var(--status-error)" sub={fmt(totals.rejected)} />
      </div>

      {/* Table */}
      <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>CO#</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Request Date</th>
                <th style={thStyle}>Approval Date</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Cost Impact</th>
              </tr>
            </thead>
            <tbody>
              {cos.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    No change orders found for this project.
                  </td>
                </tr>
              )}
              {cos.map((co, i) => {
                const amt = Number(co.co_amount) || 0;
                const isApproved = (co.status || "").trim() === "Approved";
                return (
                  <tr key={co.id || i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "var(--accent)" }}>CO-{String(co.co_number || i + 1).padStart(3, "0")}</td>
                    <td style={tdBodyStyle}>{co.description || "-"}</td>
                    <td style={{ ...tdRightStyle, fontWeight: 700, color: amt >= 0 ? "var(--text-primary)" : "var(--status-error)" }}>{fmt(amt)}</td>
                    <td style={tdStyle}><COStatusBadge status={co.status || "Draft"} /></td>
                    <td style={tdStyle}>{formatDate(co.request_date)}</td>
                    <td style={tdStyle}>{co.approval_date ? formatDate(co.approval_date) : "-"}</td>
                    <td style={{ ...tdRightStyle, fontWeight: 600, color: isApproved ? "var(--status-success)" : "var(--text-muted)" }}>
                      {isApproved ? fmt(amt) : "-"}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              {cos.length > 0 && (
                <tr>
                  <td style={totalsStyle} colSpan={2}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", textTransform: "uppercase" }}>TOTALS ({cos.length} Change Orders)</span>
                  </td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.approved + totals.pending + totals.rejected)}</td>
                  <td style={totalsStyle} />
                  <td style={totalsStyle} />
                  <td style={totalsStyle} />
                  <td style={{ ...totalsStyle, textAlign: "right", color: "var(--status-success)" }}>{fmt(totals.approved)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Billing & SOV Tab ──────────────────────────────────────────────────────
function BillingSOVTab({ sovItems, expenses, onAddSOV, onEditSOV, onDeleteSOV }) {
  const { rows, totals } = deriveBillingSov(sovItems, expenses);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KPICard label="Total Scheduled Value" value={fmtShort(totals.scheduled)} />
        <KPICard label="Billed to Date" value={fmtShort(totals.billed)} tone="var(--accent)" sub={`${safePct(totals.billed, totals.scheduled)}% of scheduled`} />
        <KPICard label="Retainage Held" value={fmtShort(totals.retainage)} tone="var(--status-warning)" />
        <KPICard label="Net Received" value={fmtShort(totals.netReceived)} tone="var(--status-success)" sub="Billed less retainage" />
      </div>

      {/* Table */}
      <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Line#</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Scheduled Value</th>
                <th style={{ ...thStyle, textAlign: "center", minWidth: 100 }}>% Complete</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Billed</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Retainage</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "center", width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    No SOV line items found for this project.
                  </td>
                </tr>
              )}
              {rows.map(({ item, scheduledValue, percentComplete, billedAmount, retainageAmount, balance }, i) => {
                return (
                  <tr key={item.id || i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "var(--accent)" }}>{item.line_item_number || i + 1}</td>
                    <td style={tdBodyStyle}>{item.description || "-"}</td>
                    <td style={tdRightStyle}>{fmt(scheduledValue)}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <ProgressBar value={percentComplete} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", minWidth: 32, textAlign: "right" }}>{Math.round(percentComplete)}%</span>
                      </div>
                    </td>
                    <td style={tdRightStyle}>{fmt(billedAmount)}</td>
                    <td style={{ ...tdRightStyle, color: "var(--status-warning)" }}>{fmt(retainageAmount)}</td>
                    <td style={{ ...tdRightStyle, color: balance > 0 ? "var(--text-secondary)" : "var(--status-success)" }}>{fmt(balance)}</td>
                    <td style={tdStyle}>
                      <COStatusBadge status={item.certification_status || "Draft"} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        {onEditSOV && (
                          <button
                            onClick={() => onEditSOV(item)}
                            title="Edit line item"
                            style={{ background: "transparent", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "4px 6px", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", alignItems: "center" }}
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {onDeleteSOV && (
                          <button
                            onClick={() => onDeleteSOV(item)}
                            title="Delete line item"
                            style={{ background: "transparent", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "4px 6px", cursor: "pointer", color: "var(--status-error)", display: "inline-flex", alignItems: "center" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              {rows.length > 0 && (
                <tr>
                  <td style={totalsStyle} colSpan={2}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", textTransform: "uppercase" }}>TOTALS ({rows.length} Line Items)</span>
                  </td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.scheduled)}</td>
                  <td style={{ ...totalsStyle, textAlign: "center" }}>{safePct(totals.billed, totals.scheduled)}%</td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.billed)}</td>
                  <td style={{ ...totalsStyle, textAlign: "right", color: "var(--status-warning)" }}>{fmt(totals.retainage)}</td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.scheduled - totals.billed)}</td>
                  <td style={totalsStyle} />
                  <td style={totalsStyle} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Contract Summary Tab ───────────────────────────────────────────────────
function ContractSummaryTab({ project, changeOrders, sovItems, revisedValue }) {
  const {
    originalValue,
    waterfallSteps,
    healthItems,
    recentApprovedChangeOrders,
  } = deriveContractSummary(project, changeOrders, sovItems, revisedValue);

  const toneMap = {
    success: { bg: "var(--success-muted)", border: "var(--success-border)", color: "var(--status-success)", icon: "\u2713" },
    warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", color: "var(--status-warning)", icon: "\u26A0" },
    error: { bg: "var(--danger-muted)", border: "var(--danger-border)", color: "var(--status-error)", icon: "\u2717" },
    info: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", color: "var(--status-info)", icon: "\u2139" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Contract Value Waterfall */}
      <div className="sbd-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Contract Value Waterfall</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {waterfallSteps.map((step, i) => {
            const maxVal = Math.max(originalValue, revisedValue, 1);
            const barWidth = Math.max(4, (Math.abs(step.value) / maxVal) * 100);
            const isLast = i === waterfallSteps.length - 1;
            return (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: isLast ? "none" : "1px solid var(--divider)" }}>
                <div style={{ width: 140, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: step.color, textAlign: "right", flexShrink: 0 }}>{step.label}</div>
                <div style={{ flex: 1, position: "relative", height: 20 }}>
                  <div style={{
                    width: `${barWidth}%`, height: "100%", borderRadius: 3,
                    background: isLast ? "var(--accent)" : step.color === "var(--status-error)" ? "var(--status-error)" : step.color === "var(--status-success)" ? "var(--status-success)" : "var(--border-default)",
                    opacity: isLast ? 1 : 0.6,
                  }} />
                </div>
                <div style={{ width: 100, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: step.color, textAlign: "right", flexShrink: 0 }}>
                  {i === 1 ? "+" : i === 2 ? "-" : ""}{fmtShort(Math.abs(step.value))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline of Key Dates */}
      <div className="sbd-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Key Dates Timeline</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
          {[
            { label: "Contract Start", date: project?.start_date, icon: "\u{1F4C5}" },
            { label: "Target Completion", date: project?.target_completion_date, icon: "\u{1F3AF}" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 200px" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{item.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{formatDate(item.date)}</div>
              </div>
            </div>
          ))}
          {/* Recent CO dates */}
          {recentApprovedChangeOrders.map((co, i) => (
              <div key={co.id || i} style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 200px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                  {"\u2705"}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>CO-{String(co.co_number).padStart(3, "0")} Approved</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--status-success)" }}>{formatDate(co.approval_date)}</div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Contract Health Assessment */}
      <div className="sbd-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Contract Health Assessment</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {healthItems.map((item, i) => {
            const t = toneMap[item.tone] || toneMap.info;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: t.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.label}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function ContractManagement() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const [activeTab, setActiveTab] = useState("CHANGE ORDERS");
  const { can } = usePermissions();
  const contractManagement = useContractManagement(projectId);
  const {
    project,
    changeOrders,
    sovItems,
    expenses,
    financials: { approvedCOTotal, pendingCOTotal, revisedValue },
    isLoading,
    isError,
    loadError,
    refetchAll,
    showSOVForm,
    editingSOV,
    deleteSOVTarget,
    setDeleteSOVTarget,
    openSOVCreate,
    openSOVEdit,
    closeSOVForm,
    saveSOV,
    deleteSOV,
    editingContract,
    contractForm,
    setContractForm,
    openContractEdit,
    cancelContractEdit,
    saveContract,
    isSavingContract,
  } = contractManagement;

  // ── No project selected ───────────────────────────────────────────────────
  if (!projectId) return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F4CB}"}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: "24px 28px" }}>
        <CommandBar
          eyebrow="CONTRACT"
          title="Contract Management"
          subtitle="Loading contract data"
        />
        <div style={{ marginTop: 20 }}>
          <LoadingSkeleton variant="table" rows={8} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sb-dashboard-reference-page" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load contract data
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(loadError, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={refetchAll}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="sb-dashboard-reference-page" style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "100vh" }}>
      <CommandBar
        eyebrow={project?.name || activeProject?.name || "PROJECT"}
        title="Contract Management"
        count={changeOrders?.length || 0}
        unit=" · CHANGE ORDERS"
        subtitle={`${fmtShort(revisedValue || 0)} revised contract · ${fmtShort(pendingCOTotal || 0)} pending CO value`}
      >
        {activeTab === "BILLING & SOV" && can("create", "sov_item") && (
          <button
            onClick={openSOVCreate}
            className="sbd-btn"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "6px 16px", background: "var(--accent)",
              color: "var(--bg-base)", border: "none",
              borderRadius: "var(--radius-btn)", cursor: "pointer",
            }}
          >
            + Add Line Item
          </button>
        )}
      </CommandBar>

      <ContractOverviewSection
        project={project}
        approvedCOTotal={approvedCOTotal}
        pendingCOTotal={pendingCOTotal}
        revisedValue={revisedValue}
        editingContract={editingContract}
        contractForm={contractForm}
        setContractForm={setContractForm}
        onEditContract={can("edit", "contract") ? openContractEdit : null}
        onSaveContract={saveContract}
        onCancelContract={cancelContractEdit}
        isSaving={isSavingContract}
      />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {CONTRACT_TABS.map((tab) => (
          <TabButton key={tab} label={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)} />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "CHANGE ORDERS" && (
        <ChangeOrdersTab changeOrders={changeOrders} />
      )}
      {activeTab === "BILLING & SOV" && (
        <BillingSOVTab
          sovItems={sovItems}
          expenses={expenses}
          onAddSOV={can("create", "sov_item") ? openSOVCreate : null}
          onEditSOV={can("edit", "sov_item") ? openSOVEdit : null}
          onDeleteSOV={can("delete", "sov_item") ? setDeleteSOVTarget : null}
        />
      )}
      {activeTab === "CONTRACT SUMMARY" && (
        <ContractSummaryTab
          project={project}
          changeOrders={changeOrders}
          sovItems={sovItems}
          revisedValue={revisedValue}
        />
      )}

      {/* SOV Form Modal */}
      <SOVFormModal
        open={showSOVForm}
        onClose={closeSOVForm}
        onSave={saveSOV}
        sov={editingSOV}
        projects={[project].filter(Boolean)}
        activeProject={project || activeProject}
      />

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteSOVTarget}
        onClose={() => setDeleteSOVTarget(null)}
        onConfirm={deleteSOV}
        title="Delete SOV Line Item"
        description={`Delete line item "${deleteSOVTarget?.description || ""}"? This cannot be undone.`}
      />
    </div>
  );
}
