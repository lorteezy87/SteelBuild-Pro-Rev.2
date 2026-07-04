import React from "react";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "../../shared/formatters";
import { formatLocalDate } from "@/utils/dates";
import ProgressBar from "../../shared/ProgressBar";
import { HealthPill, healthColor } from "../portfolioHealth";
import { PHASE_DOT, MiniProjectTimeline } from "../portfolioTimeline";
import { computeVarianceColor } from "../portfolioDerive";

const ROW_HEIGHT = 40;

/**
 * ProjectHealthRow — one project's row in the Project Health Overview table
 * (plus the thin progress sub-row beneath it). Extracted verbatim from
 * PortfolioView; every value/handler it references is passed in as a prop so
 * the row carries no derivation of its own.
 */
export default function ProjectHealthRow({
  p,
  i,
  projectScheduleSummaries,
  openProjectDashboard,
  navigate,
}) {
  const { variance, isOver: isOverBudget } = computeVarianceColor(p.budget, p.actual, p.hasBudgetData);
  const hStatus = p.effectiveHealth || p.health_status;
  const rowBg = hStatus === "At Risk" ? "rgba(255,61,61,0.04)" : hStatus === "Watch" ? "rgba(245,158,11,0.03)" : "transparent";
  const hColor = healthColor(hStatus);
  return (
    <React.Fragment>
    <tr
      onClick={() => openProjectDashboard(p.id)}
      style={{
        borderBottom: "1px solid var(--divider)",
        background: rowBg,
        height: ROW_HEIGHT,
        cursor: "pointer",
        transition: "background 0.12s",
        borderLeft: `4px solid ${hColor}`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
      onMouseLeave={e => e.currentTarget.style.background = rowBg}
    >
      <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{i + 1}</td>
      <td style={{ padding: "6px 8px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", minWidth: 160 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 700 }}>{p.name || p.project_number}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{p.project_number}</span>
        </div>
      </td>
      <td style={{ padding: "6px 8px", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: PHASE_DOT[p.phase] || "var(--text-muted)", display: "inline-block", marginRight: 6 }} />
        {p.phase || "—"}
      </td>
      {/* Timeline — compact per-project mini-Gantt. The bars
          are now individually clickable: phase bar → Schedule
          scoped to this project + filtered to that phase; any
          other part of the strip → the full schedule. We stop
          propagation inside so neither firing triggers the
          outer row click ("open project dashboard"). */}
      <td
        style={{ padding: "6px 8px", textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <MiniProjectTimeline
          summary={projectScheduleSummaries[p.id]}
          onTimelineClick={() => navigate(`${createPageUrl("Schedule")}?project=${p.id}`)}
          onPhaseClick={(phaseKey) => navigate(`${createPageUrl("Schedule")}?project=${p.id}&phase=${encodeURIComponent(phaseKey)}`)}
        />
      </td>
      <td style={{ padding: "6px 8px", textAlign: "center" }}>
        <HealthPill status={hStatus} score={p.healthScore} reasons={p.healthReasons} />
        {p.healthReasons?.length > 0 && hStatus !== "On Track" && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, maxWidth: 140, lineHeight: 1.3 }}>
            {p.healthReasons[0]}
          </div>
        )}
        {/* Stale-PSR-import flag. The health shown above is now the
            LIVE auto-health (enrichProjectMetrics demotes a stale
            snapshot), so this chip just notes the imported PSR is old
            and disagreed — prompting a re-import. */}
        {(() => {
          const prov = p.psrProvenance;
          if (!prov?.driftRisk) return null;
          return (
            <div
              title={`Showing live health. An imported PSR snapshot from ${formatLocalDate(prov.importedAt)} (${prov.ageDays}d old) rated this "${prov.snapshotHealth}" — re-import the PSR if it's out of date.`}
              style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", color: "var(--status-warning)", border: "1px solid color-mix(in srgb, var(--status-warning) 45%, transparent)", background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", padding: "1px 6px", borderRadius: 999, whiteSpace: "nowrap" }}
            >
              ⚠ PSR · {prov.ageDays}d old
            </div>
          );
        })()}
      </td>
      {/* Budget — click drills into Expenses scoped to project.
          The Expenses page is the closest surface to budget +
          cost-code data today; long-term a dedicated Costs
          page would land these three columns cleaner. */}
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
        }}
        title={p.hasBudgetData ? `Budget: ${formatCurrency(p.budget)} · Source: Cost Codes · Click to view expenses` : "No cost codes set up — click to open Expenses"}
        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasBudgetData ? "var(--text-primary)" : "var(--status-warning)", cursor: "pointer" }}
      >
        {p.hasBudgetData ? formatCurrency(p.budget).replace(/\.\d+/, "") : (
          <span style={{ fontSize: 8, fontWeight: 600, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 3, padding: "1px 5px" }}>
            SET UP
          </span>
        )}
      </td>
      {/* Actual — drills into Expenses */}
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
        }}
        title={p.hasActualData ? `Actual spend: ${formatCurrency(p.actual)} · Source: Paid Expenses · Click to view` : "No expense data — click to open Expenses"}
        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: p.hasActualData ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer" }}
      >
        {p.hasActualData ? formatCurrency(p.actual).replace(/\.\d+/, "") : (
          <span style={{ fontSize: 8, color: "var(--text-muted)" }}>$0</span>
        )}
      </td>
      {/* Variance = Budget - Actual (positive = under budget) — drills into Expenses */}
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("Expenses")}?project=${p.id}`);
        }}
        title={`Budget: ${p.hasBudgetData ? formatCurrency(p.budget) : "N/A"} | Actual: ${p.hasActualData ? formatCurrency(p.actual) : "N/A"} | Variance: ${variance !== null ? (isOverBudget ? "-" : "+") + formatCurrency(Math.abs(variance)) : "N/A"} · Click to view expenses`}
        style={{
          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          color: variance === null ? "var(--text-muted)" : isOverBudget ? "var(--status-error)" : "var(--status-success)",
          background: isOverBudget ? "rgba(248,81,73,0.06)" : "transparent",
          cursor: "pointer",
        }}
      >
        {variance === null ? "—" : (
          <span style={{
            background: isOverBudget ? "var(--danger-muted)" : "var(--success-muted)",
            border: `1px solid ${isOverBudget ? "var(--danger-border)" : "var(--success-border)"}`,
            borderRadius: 3, padding: "1px 6px",
          }}>
            {(isOverBudget ? "−" : "+") + formatCurrency(Math.abs(variance)).replace(/\.\d+/, "")}
          </span>
        )}
      </td>
      {/* Projected Margin = Contract Value − max(budget, actual + pending CO exposure).
          Drills into Change Orders because pending COs are the
          primary variable pushing the margin around. */}
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("ChangeOrders")}?project=${p.id}`);
        }}
        title={p.projectedMargin === null
          ? "No contract value entered — set original_contract_value to see projected margin"
          : `Contract: ${formatCurrency(p.contractValue)} · Est. cost at completion: ${formatCurrency(p.estimatedCostAtCompletion)} · Margin: ${(p.projectedMarginPct ?? 0).toFixed(1)}% · Click to review COs`}
        style={{
          padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          color: p.projectedMargin === null ? "var(--text-muted)" : p.projectedMargin < 0 ? "var(--status-error)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--status-warning)" : "var(--status-success)",
          cursor: "pointer",
        }}
      >
        {p.projectedMargin === null ? "—" : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
            <span style={{
              background: p.projectedMargin < 0 ? "var(--danger-muted)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--warning-muted)" : "var(--success-muted)",
              border: `1px solid ${p.projectedMargin < 0 ? "var(--danger-border)" : (p.projectedMarginPct ?? 0) < 5 ? "var(--warning-border)" : "var(--success-border)"}`,
              borderRadius: 3, padding: "1px 6px",
            }}>
              {(p.projectedMargin < 0 ? "−" : "+") + formatCurrency(Math.abs(p.projectedMargin)).replace(/\.\d+/, "")}
            </span>
            <span style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{(p.projectedMarginPct ?? 0).toFixed(1)}%</span>
          </div>
        )}
      </td>
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("RFIs")}?project=${p.id}`);
        }}
        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue · Click to open RFIs`}
        style={{
          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
          color: p.overdueRFIs > 0 ? "var(--status-error)" : p.openRFIs > 3 ? "var(--status-warning)" : "var(--text-primary)",
          fontSize: 16, fontWeight: 800,
          background: p.overdueRFIs > 2 ? "rgba(248,81,73,0.08)" : p.openRFIs > 5 ? "rgba(227,179,65,0.06)" : "transparent",
          cursor: "pointer",
        }}
      >
        {p.openRFIs}
      </td>
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("RFIs")}?project=${p.id}`);
        }}
        title={`${p.openRFIs} open, ${p.overdueRFIs} overdue · Click to open RFIs`}
        style={{
          padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)",
          color: p.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)",
          fontSize: 10, fontWeight: p.overdueRFIs > 0 ? 700 : 400,
          background: p.overdueRFIs > 0 ? "rgba(248,81,73,0.06)" : "transparent",
          cursor: "pointer",
        }}
      >
        {p.overdueRFIs > 0 ? (
          <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "1px 6px" }}>
            {p.overdueRFIs}
          </span>
        ) : p.overdueRFIs}
      </td>
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("WorkPackages")}?project=${p.id}`);
        }}
        title="WP progress · Click to open Work Packages"
        style={{ padding: "6px 8px", minWidth: 130, cursor: "pointer" }}
      >
        <ProgressBar value={p.avgProgress || 0} />
      </td>
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("ChangeOrders")}?project=${p.id}`);
        }}
        title={`${p.pendingCOs.length} pending COs totaling ${formatCurrency(p.pendingCOValue)} · Click to review`}
        style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: p.pendingCOs.length > 0 ? 16 : 10, fontWeight: p.pendingCOs.length > 0 ? 800 : 400, color: p.pendingCOs.length > 0 ? "var(--status-warning)" : "var(--text-muted)", cursor: "pointer" }}
      >
        {p.pendingCOs.length > 0 ? `${p.pendingCOs.length} · ${formatCurrency(p.pendingCOValue).replace(/\.\d+/, "")}` : "—"}
      </td>
      <td
        onClick={(e) => {
          e.stopPropagation();
          navigate(`${createPageUrl("WorkPackages")}?project=${p.id}`);
        }}
        title={p.tonnage > 0 ? `${p.tonnage}T total · ${p.avgProgress}% WP progress · Source: Work Packages · Click to open` : "No tonnage entered — click to open Work Packages"}
        style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: p.tonnage > 0 ? "var(--text-secondary)" : "var(--text-muted)", cursor: "pointer" }}
      >{p.tonnage > 0 ? `${p.tonnage}T` : <span style={{ fontSize: 8 }}>0T</span>}</td>
      <td style={{ padding: "6px 6px", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
          {[
            // DASH uses a callback to switch the active project AND go to /Dashboard
            // (there is no standalone /ProjectDashboard route). Peer buttons navigate
            // via URL and carry `?project=<id>` so the destination page filters to
            // this row's project (previously they dumped the user on ALL RFIs / ALL
            // deliveries, losing context from the click that just happened).
            //
            // SCHED is always rendered — every PM reviews the schedule, even when
            // there's no signal. RFIs / DEL stay conditional so they only appear when
            // there's something to act on (keeps the 3-slot row uncluttered).
            { label: "DASH",  nav: () => openProjectDashboard(p.id), primary: true },
            { label: "SCHED", nav: `${createPageUrl("Schedule")}?project=${p.id}`, accent: "var(--status-info)" },
            ...(p.openRFIs > 0
              ? [{ label: "RFIs", nav: `${createPageUrl("RFIs")}?project=${p.id}`, accent: "var(--status-warning)" }]
              : []),
            ...(p.lateDeliveries > 0
              ? [{ label: "DEL", nav: `${createPageUrl("Deliveries")}?project=${p.id}`, accent: "var(--status-error)" }]
              : []),
          ].slice(0, 3).map((btn) => (
            <button
              key={btn.label}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof btn.nav === "function") btn.nav();
                else navigate(btn.nav);
              }}
              style={{
                background: btn.primary ? "var(--accent-muted)" : "var(--bg-surface)",
                border: `1px solid ${btn.primary ? "var(--accent-border)" : btn.accent ? `${btn.accent}44` : "var(--border-default)"}`,
                borderRadius: 3,
                color: btn.primary ? "var(--accent)" : btn.accent || "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                padding: "3px 7px",
                cursor: "pointer",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = btn.primary ? "var(--accent)" : (btn.accent || "var(--accent)"); e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = btn.primary ? "var(--accent-muted)" : "var(--bg-surface)"; e.currentTarget.style.color = btn.primary ? "var(--accent)" : (btn.accent || "var(--text-secondary)"); }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </td>
    </tr>
    <tr style={{ height: 3, padding: 0 }}>
      <td colSpan={15} style={{ padding: 0, border: "none" }}>
        <div style={{ width: "100%", height: 3, background: "var(--bg-surface-low)" }}>
          <div style={{ width: `${Math.min(p.avgProgress || 0, 100)}%`, height: 3, background: hColor, transition: "width 0.3s ease" }} />
        </div>
      </td>
    </tr>
    </React.Fragment>
  );
}
