import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@/services/cacheRegistry";
import { useProjectContext } from "@/components/shared/useProjectContext";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatDate } from "@/components/shared/formatters";

// ─── Currency formatters ────────────────────────────────────────────────────
const fmt = (v) => {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtShort = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};

const pct = (n, d) => {
  const num = Number(n) || 0;
  const den = Number(d) || 0;
  if (den === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((num / den) * 100)));
};

// ─── Inline components ──────────────────────────────────────────────────────

const PageHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
    <div>
      <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-primary)", margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{subtitle}</p>}
    </div>
  </div>
);

const KPICard = ({ label, value, sub, tone }) => (
  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: tone || "var(--text-primary)" }}>{value}</span>
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
      color: active ? "#fff" : "var(--text-muted)",
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

// ─── Arrow connector for overview flow ──────────────────────────────────────
const FlowArrow = () => (
  <div style={{ display: "flex", alignItems: "center", padding: "0 4px", color: "var(--text-muted)", fontSize: 18 }}>
    &rarr;
  </div>
);

// ─── Contract Overview Panel ────────────────────────────────────────────────
function ContractOverviewPanel({ project, approvedCOTotal, pendingCOTotal, revisedValue }) {
  const originalValue = Number(project?.original_contract_value) || 0;

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)", padding: 20, marginBottom: 18,
      boxShadow: "var(--shadow-card)",
    }}>
      {/* Value flow row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Original Contract</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{fmtShort(originalValue)}</div>
        </div>
        <FlowArrow />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--status-success)", marginBottom: 4 }}>+Approved COs</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "var(--status-success)" }}>+{fmtShort(approvedCOTotal)}</div>
        </div>
        <FlowArrow />
        <div style={{ textAlign: "center", padding: "8px 16px", background: "rgba(234,88,12,0.08)", borderRadius: 8, border: "1px solid rgba(234,88,12,0.25)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>Revised Contract</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{fmtShort(revisedValue)}</div>
        </div>
      </div>

      {/* Contract details row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", borderTop: "1px solid var(--divider)", paddingTop: 14 }}>
        {[
          { label: "Contract Type", value: project?.contract_type || "N/A" },
          { label: "Start Date", value: formatDate(project?.start_date) },
          { label: "Target Completion", value: formatDate(project?.target_completion_date) },
          { label: "Project Manager", value: project?.project_manager || "N/A" },
          { label: "Superintendent", value: project?.superintendent || "N/A" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center", minWidth: 100 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Pending COs indicator */}
      {pendingCOTotal > 0 && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "3px 10px", borderRadius: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {fmt(pendingCOTotal)} in Pending Change Orders
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Change Orders Tab ──────────────────────────────────────────────────────
function ChangeOrdersTab({ changeOrders }) {
  const cos = useMemo(() => [...(changeOrders || [])].sort((a, b) => (Number(a.co_number) || 0) - (Number(b.co_number) || 0)), [changeOrders]);

  const totals = useMemo(() => {
    let total = 0, approved = 0, pending = 0, rejected = 0, rejectedCount = 0;
    for (const co of cos) {
      const amt = Number(co.co_amount) || 0;
      total += amt;
      const s = (co.status || "").trim();
      if (s === "Approved") approved += amt;
      else if (s === "Rejected") { rejected += amt; rejectedCount++; }
      else pending += amt;
    }
    return { total: cos.length, approved, pending, rejected, rejectedCount };
  }, [cos]);

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
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
function BillingSOVTab({ sovItems, expenses }) {
  const items = useMemo(() => [...(sovItems || [])].sort((a, b) => (Number(a.line_item_number) || 0) - (Number(b.line_item_number) || 0)), [sovItems]);

  const totals = useMemo(() => {
    let scheduled = 0, billed = 0, retainage = 0;
    for (const item of items) {
      const sv = Number(item.scheduled_value) || 0;
      const prog = Math.min(100, Math.max(0, Number(item.progress_pct) || 0)) / 100;
      const ret = Math.min(100, Math.max(0, Number(item.retainage_pct) || 0)) / 100;
      const billedAmt = sv * prog;
      const retainageAmt = billedAmt * ret;
      scheduled += sv;
      billed += billedAmt;
      retainage += retainageAmt;
    }
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return { scheduled, billed, retainage, netReceived: billed - retainage, totalExpenses };
  }, [items, expenses]);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KPICard label="Total Scheduled Value" value={fmtShort(totals.scheduled)} />
        <KPICard label="Billed to Date" value={fmtShort(totals.billed)} tone="var(--accent)" sub={`${pct(totals.billed, totals.scheduled)}% of scheduled`} />
        <KPICard label="Retainage Held" value={fmtShort(totals.retainage)} tone="var(--status-warning)" />
        <KPICard label="Net Received" value={fmtShort(totals.netReceived)} tone="var(--status-success)" sub="Billed less retainage" />
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    No SOV line items found for this project.
                  </td>
                </tr>
              )}
              {items.map((item, i) => {
                const sv = Number(item.scheduled_value) || 0;
                const prog = Math.min(100, Math.max(0, Number(item.progress_pct) || 0));
                const ret = Math.min(100, Math.max(0, Number(item.retainage_pct) || 0)) / 100;
                const billedAmt = sv * (prog / 100);
                const retainageAmt = billedAmt * ret;
                const balance = sv - billedAmt;

                return (
                  <tr key={item.id || i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "var(--accent)" }}>{item.line_item_number || i + 1}</td>
                    <td style={tdBodyStyle}>{item.description || "-"}</td>
                    <td style={tdRightStyle}>{fmt(sv)}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <ProgressBar value={prog} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", minWidth: 32, textAlign: "right" }}>{Math.round(prog)}%</span>
                      </div>
                    </td>
                    <td style={tdRightStyle}>{fmt(billedAmt)}</td>
                    <td style={{ ...tdRightStyle, color: "var(--status-warning)" }}>{fmt(retainageAmt)}</td>
                    <td style={{ ...tdRightStyle, color: balance > 0 ? "var(--text-secondary)" : "var(--status-success)" }}>{fmt(balance)}</td>
                    <td style={tdStyle}>
                      <COStatusBadge status={item.certification_status || "Draft"} />
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              {items.length > 0 && (
                <tr>
                  <td style={totalsStyle} colSpan={2}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", textTransform: "uppercase" }}>TOTALS ({items.length} Line Items)</span>
                  </td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.scheduled)}</td>
                  <td style={{ ...totalsStyle, textAlign: "center" }}>{pct(totals.billed, totals.scheduled)}%</td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.billed)}</td>
                  <td style={{ ...totalsStyle, textAlign: "right", color: "var(--status-warning)" }}>{fmt(totals.retainage)}</td>
                  <td style={{ ...totalsStyle, textAlign: "right" }}>{fmt(totals.scheduled - totals.billed)}</td>
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
  const originalValue = Number(project?.original_contract_value) || 0;

  const coBreakdown = useMemo(() => {
    let approved = 0, rejected = 0, pending = 0;
    for (const co of (changeOrders || [])) {
      const amt = Number(co.co_amount) || 0;
      const s = (co.status || "").trim();
      if (s === "Approved") approved += amt;
      else if (s === "Rejected") rejected += amt;
      else pending += amt;
    }
    return { approved, rejected, pending };
  }, [changeOrders]);

  const sovTotal = useMemo(() => (sovItems || []).reduce((sum, item) => sum + (Number(item.scheduled_value) || 0), 0), [sovItems]);
  const billedTotal = useMemo(() => (sovItems || []).reduce((sum, item) => {
    const sv = Number(item.scheduled_value) || 0;
    const prog = Math.min(100, Math.max(0, Number(item.progress_pct) || 0)) / 100;
    return sum + sv * prog;
  }, 0), [sovItems]);

  const sovMismatch = Math.abs(sovTotal - revisedValue);
  const sovMismatchPct = revisedValue > 0 ? Math.round((sovMismatch / revisedValue) * 100) : 0;
  const billingProgress = pct(billedTotal, revisedValue);
  const outstandingCOs = (changeOrders || []).filter(co => !["Approved", "Rejected"].includes((co.status || "").trim())).length;

  // Waterfall data
  const waterfallSteps = [
    { label: "Original Contract", value: originalValue, color: "var(--text-primary)", running: originalValue },
    { label: "+Approved COs", value: coBreakdown.approved, color: "var(--status-success)", running: originalValue + coBreakdown.approved },
    { label: "-Rejected COs", value: coBreakdown.rejected, color: "var(--status-error)", running: originalValue + coBreakdown.approved },
    { label: "= Revised Contract", value: revisedValue, color: "var(--accent)", running: revisedValue },
  ];

  // Health assessment
  const healthItems = [];
  if (sovMismatchPct > 5) {
    healthItems.push({ label: "SOV vs Contract Mismatch", detail: `SOV total (${fmt(sovTotal)}) differs from revised contract by ${fmt(sovMismatch)} (${sovMismatchPct}%)`, tone: "error" });
  } else if (sovMismatchPct > 1) {
    healthItems.push({ label: "SOV vs Contract Mismatch", detail: `SOV total (${fmt(sovTotal)}) differs from revised contract by ${fmt(sovMismatch)} (${sovMismatchPct}%)`, tone: "warning" });
  } else {
    healthItems.push({ label: "SOV vs Contract Alignment", detail: `SOV total (${fmt(sovTotal)}) aligns with revised contract value`, tone: "success" });
  }

  healthItems.push({
    label: "Billing Progress",
    detail: `${billingProgress}% billed (${fmt(billedTotal)} of ${fmt(revisedValue)})`,
    tone: billingProgress >= 75 ? "success" : billingProgress >= 40 ? "warning" : "info",
  });

  if (outstandingCOs > 0) {
    healthItems.push({ label: "Outstanding Change Orders", detail: `${outstandingCOs} change order(s) pending review or approval (${fmt(coBreakdown.pending)})`, tone: outstandingCOs > 3 ? "error" : "warning" });
  } else {
    healthItems.push({ label: "Change Orders", detail: "All change orders resolved", tone: "success" });
  }

  const toneMap = {
    success: { bg: "var(--success-muted)", border: "var(--success-border)", color: "var(--status-success)", icon: "\u2713" },
    warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", color: "var(--status-warning)", icon: "\u26A0" },
    error: { bg: "var(--danger-muted)", border: "var(--danger-border)", color: "var(--status-error)", icon: "\u2717" },
    info: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", color: "var(--status-info)", icon: "\u2139" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Contract Value Waterfall */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
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
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
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
          {(changeOrders || [])
            .filter(co => co.approval_date && (co.status || "").trim() === "Approved")
            .sort((a, b) => new Date(b.approval_date) - new Date(a.approval_date))
            .slice(0, 3)
            .map((co, i) => (
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
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
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

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: getQueryKey("project", projectId),
    queryFn: () => base44.entities.Project.list(),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    select: (projects) => (projects || []).find((p) => p.id === projectId),
  });

  const { data: changeOrders = [], isLoading: cosLoading } = useQuery({
    queryKey: getQueryKey("change_order", projectId),
    queryFn: () => base44.entities.ChangeOrder.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sovItems = [], isLoading: sovLoading } = useQuery({
    queryKey: getQueryKey("sov_item", projectId),
    queryFn: () => base44.entities.SOVItem.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => base44.entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const approvedCOTotal = useMemo(() =>
    changeOrders.filter(co => (co.status || "").trim() === "Approved").reduce((sum, co) => sum + (Number(co.co_amount) || 0), 0),
    [changeOrders]
  );

  const pendingCOTotal = useMemo(() =>
    changeOrders.filter(co => !["Approved", "Rejected"].includes((co.status || "").trim())).reduce((sum, co) => sum + (Number(co.co_amount) || 0), 0),
    [changeOrders]
  );

  const originalValue = Number(project?.original_contract_value) || 0;
  const revisedValue = Number(project?.revised_contract_value) || (originalValue + approvedCOTotal);

  const isLoading = projectLoading || cosLoading || sovLoading || expensesLoading;

  // ── No project selected ───────────────────────────────────────────────────
  if (!projectId) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F4CB}"}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>Select a project</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{ padding: "24px 28px" }}>
      <PageHeader title="Contract Management" subtitle="Loading..." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", height: 80, animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
        ))}
      </div>
    </div>
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = ["CHANGE ORDERS", "BILLING & SOV", "CONTRACT SUMMARY"];

  return (
    <div style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "100vh" }}>
      <PageHeader title="Contract Management" subtitle={project?.name || activeProject?.name || "Project"} />

      <ContractOverviewPanel
        project={project}
        approvedCOTotal={approvedCOTotal}
        pendingCOTotal={pendingCOTotal}
        revisedValue={revisedValue}
      />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {TABS.map((tab) => (
          <TabButton key={tab} label={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)} />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "CHANGE ORDERS" && (
        <ChangeOrdersTab changeOrders={changeOrders} />
      )}
      {activeTab === "BILLING & SOV" && (
        <BillingSOVTab sovItems={sovItems} expenses={expenses} />
      )}
      {activeTab === "CONTRACT SUMMARY" && (
        <ContractSummaryTab
          project={project}
          changeOrders={changeOrders}
          sovItems={sovItems}
          revisedValue={revisedValue}
        />
      )}
    </div>
  );
}
