import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ProjectCommandStrip from "./ProjectCommandStrip";
import SteelExecutionStatusCard from "./SteelExecutionStatusCard";
import FinancialSnapshotCard from "./FinancialSnapshotCard";
import UpcomingDeliveriesCard from "./UpcomingDeliveriesCard";
import DrawingApprovalStatusCard from "./DrawingApprovalStatusCard";
import BudgetOverviewChart from "../financials/BudgetOverviewChart";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`);
}

function daysBetween(dateA, dateB) {
  return Math.floor((dateA.getTime() - dateB.getTime()) / 86400000);
}

function fmtDate(value) {
  const date = parseDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toneStyles(tone) {
  const map = {
    danger: {
      color: "var(--status-error)",
      bg: "var(--danger-muted)",
      border: "var(--danger-border)",
    },
    warning: {
      color: "var(--status-warning)",
      bg: "var(--warning-muted)",
      border: "var(--warning-border)",
    },
    success: {
      color: "var(--status-success)",
      bg: "var(--success-muted)",
      border: "var(--success-border)",
    },
    accent: {
      color: "var(--accent)",
      bg: "var(--accent-muted)",
      border: "var(--accent-border)",
    },
    muted: {
      color: "var(--text-muted)",
      bg: "rgba(140,144,159,0.10)",
      border: "rgba(140,144,159,0.24)",
    },
  };
  return map[tone] || map.muted;
}

function Card({ title, count, tone = "accent", action, children, minHeight }) {
  const style = toneStyles(tone);
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        minHeight: minHeight || "auto",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-sidebar)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: style.color, borderRadius: 2 }} />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </div>
          {count != null && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: style.color,
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: "var(--radius-badge)",
                padding: "2px 8px",
              }}
            >
              {count}
            </div>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function StatStrip({ stats }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {stats.map((item) => (
        <div
          key={item.label}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderTop: `2px solid ${item.color}`,
            borderRadius: "var(--radius-card)",
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              color: item.color,
              marginBottom: 4,
            }}
          >
            {item.value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            {item.label}
          </div>
          {item.subtext ? (
            <div
              style={{
                marginTop: 5,
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              {item.subtext}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function QuickActionRail({ actions, onNavigate }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 8,
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onNavigate(action.page)}
          style={{
            background: action.primary ? "var(--accent)" : "var(--bg-surface-low)",
            color: action.primary ? "var(--accent-text)" : "var(--text-secondary)",
            border: action.primary ? "none" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {action.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: action.primary ? "var(--accent-text)" : "var(--text-muted)",
            }}
          >
            {action.detail}
          </span>
        </button>
      ))}
    </div>
  );
}
function WorkList({ items, empty, onOpen }) {
  if (!items.length) {
    return (
      <div
        style={{
          padding: "18px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {empty}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const tone = toneStyles(item.tone);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpen(item.page)}
            style={{
              background: "var(--bg-surface-low)",
              border: `1px solid ${tone.border}`,
              borderLeft: `3px solid ${tone.color}`,
              borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: tone.color,
                    }}
                  >
                    {item.kicker}
                  </span>
                  {item.badge ? (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 7px",
                      }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 3,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  {item.detail}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                OPEN
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FeedList({ items }) {
  if (!items.length) {
    return (
      <div
        style={{
          padding: "18px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        No changes captured since yesterday
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.key}
          style={{
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              {item.when}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {item.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DrilldownView({
  project,
  rfis,
  cos,
  codes,
  wps,
  drawings,
  tasks,
  actionItems,
  deliveries,
  expenses,
  recentActivity,
  onClearProject,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = useMemo(() => startOfToday(), []);

  const financials = useMemo(() => {
    const contractValue = Number(project.original_contract_value) || 0;
    const approvedCOVal = cos
      .filter((c) => c.status === "Approved")
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revisedValue = contractValue + approvedCOVal;
    const activeExpenses = expenses.filter((expense) => expense.payment_status !== "Voided");
    const budgetCommitted = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const actualSpend = activeExpenses
      .filter((expense) => expense.payment_status === "Paid")
      .reduce((s, expense) => s + (Number(expense.amount) || 0), 0);
    const committedCosts = activeExpenses.reduce(
      (s, expense) => s + (Number(expense.amount) || 0),
      0
    );
    const pendingCOVal = cos
      .filter((c) => ["Submitted", "Under Review"].includes(c.status))
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    return {
      contractValue,
      approvedCOVal,
      revisedValue,
      budgetCommitted,
      actualSpend,
      committedCosts,
      pendingCOVal,
    };
  }, [project, cos, codes, expenses]);

  const userTokens = useMemo(() => {
    const tokens = new Set();
    if (user?.full_name) tokens.add(user.full_name.toLowerCase());
    if (user?.email) {
      tokens.add(user.email.toLowerCase());
      tokens.add(user.email.split("@")[0].toLowerCase());
    }
    return Array.from(tokens);
  }, [user]);
  const derived = useMemo(() => {
    const isOpenRFI = (rfi) => !["Answered", "Closed"].includes(rfi.status);
    const isDrawingLate = (drawing) =>
      drawing.due_date &&
      parseDate(drawing.due_date) &&
      parseDate(drawing.due_date) < today &&
      drawing.stage !== "Released";
    const isDeliveryLate = (delivery) =>
      delivery.scheduled_date &&
      parseDate(delivery.scheduled_date) &&
      parseDate(delivery.scheduled_date) < today &&
      delivery.status !== "Delivered";
    const isActionOpen = (item) => !["Complete", "Closed", "Cancelled", "Resolved"].includes(item.status);
    const isConstraint = (item) => item.category === "CONSTRAINT";
    const isMine = (value) => {
      const normalized = (value || "").toLowerCase();
      return userTokens.some((token) => token && normalized.includes(token));
    };

    const overdueRfis = rfis.filter((r) => isOpenRFI(r) && r.due_date && parseDate(r.due_date) < today);
    const lateDrawings = drawings.filter(isDrawingLate);
    const lateDeliveries = deliveries.filter(isDeliveryLate);
    const blockedWps = wps.filter((wp) => wp.status === "On Hold");
    const pendingCosts = financials.committedCosts - financials.actualSpend;
    const openActions = actionItems.filter(isActionOpen);
    const overdueActions = openActions.filter((item) => item.due_date && parseDate(item.due_date) < today);
    const constraints = openActions.filter(isConstraint);
    const overdueConstraints = constraints.filter((item) => item.due_date && parseDate(item.due_date) < today);
    const upcomingRfis = rfis.filter((r) => {
      if (!isOpenRFI(r) || !r.due_date) return false;
      const due = parseDate(r.due_date);
      return due && due >= today && daysBetween(due, today) <= 3;
    });
    const pendingRevisions = drawings.filter((drawing) =>
      ["OFA", "BFA", "OFS", "BFS", "FFF"].includes(drawing.stage)
    );
    const stalledPackages = wps.filter(
      (wp) => wp.status !== "Complete" && Number(wp.percent_complete || 0) === 0
    );

    const attentionItems = [
      ...overdueRfis.map((rfi) => ({
        key: `rfi-${rfi.id}`,
        kicker: rfi.rfi_number || "RFI",
        title: rfi.title || "Open RFI requires response",
        detail: `${daysBetween(today, parseDate(rfi.due_date))}d overdue | ${rfi.status} | ${rfi.priority || "No priority"}`,
        badge: "RFI",
        tone: rfi.priority === "Critical" ? "danger" : "warning",
        page: "RFIs",
      })),
      ...lateDrawings.map((drawing) => ({
        key: `dwg-${drawing.id}`,
        kicker: drawing.sheet_number || "Drawing",
        title: drawing.title || "Drawing review pending",
        detail: `${drawing.stage} | Due ${fmtDate(drawing.due_date)} | Rev ${drawing.revision_number || 0}`,
        badge: "REVISION",
        tone: "danger",
        page: "Drawings",
      })),
      ...lateDeliveries.map((delivery) => ({
        key: `delivery-${delivery.id}`,
        kicker: delivery.delivery_id || "Delivery",
        title: delivery.description || delivery.vendor || "Delivery update needed",
        detail: `${delivery.vendor || "Vendor not set"} | Due ${fmtDate(delivery.scheduled_date)}`,
        badge: "DELIVERY",
        tone: "warning",
        page: "Deliveries",
      })),
      ...blockedWps.map((wp) => ({
        key: `wp-${wp.id}`,
        kicker: wp.wp_number || "WP",
        title: wp.name || "Blocked work package",
        detail: `${wp.phase || "No phase"} | ${wp.crew || "Crew not set"} | On Hold`,
        badge: "BLOCKED",
        tone: "danger",
        page: "WorkPackages",
      })),
      ...overdueActions.map((item) => ({
        key: `action-${item.id}`,
        kicker: item.priority || "Action",
        title: item.title || "Action overdue",
        detail: `${item.assigned_to || "Unassigned"} | Due ${fmtDate(item.due_date)}`,
        badge: isConstraint(item) ? "CONSTRAINT" : "ACTION",
        tone: isConstraint(item) ? "danger" : "warning",
        page: isConstraint(item) ? "Constraints" : "ActionItems",
      })),
    ]
      .sort((a, b) => {
        const order = { danger: 0, warning: 1, accent: 2, muted: 3 };
        return (order[a.tone] ?? 4) - (order[b.tone] ?? 4);
      })
      .slice(0, 8);

    const myItems = [
      ...rfis
        .filter((rfi) => isOpenRFI(rfi) && (isMine(rfi.assigned_to) || isMine(rfi.ball_in_court)))
        .map((rfi) => ({
          key: `my-rfi-${rfi.id}`,
          kicker: "RFI",
          title: rfi.title || rfi.rfi_number || "Assigned RFI",
          detail: `${rfi.status} | Due ${rfi.due_date ? fmtDate(rfi.due_date) : "No due date"}`,
          badge: rfi.priority || "OPEN",
          tone: rfi.due_date && parseDate(rfi.due_date) < today ? "danger" : "warning",
          page: "RFIs",
        })),
      ...openActions
        .filter((item) => isMine(item.assigned_to))
        .map((item) => ({
          key: `my-action-${item.id}`,
          kicker: isConstraint(item) ? "CONSTRAINT" : "ACTION",
          title: item.title || "Assigned action item",
          detail: `${item.status || "Open"} | Due ${item.due_date ? fmtDate(item.due_date) : "No due date"}`,
          badge: item.priority || "OPEN",
          tone: item.due_date && parseDate(item.due_date) < today ? "danger" : "accent",
          page: isConstraint(item) ? "Constraints" : "ActionItems",
        })),
      ...deliveries
        .filter((delivery) => isMine(delivery.assigned_to) || isMine(delivery.received_by))
        .map((delivery) => ({
          key: `my-delivery-${delivery.id}`,
          kicker: "DELIVERY",
          title: delivery.description || delivery.vendor || "Assigned delivery",
          detail: `${delivery.status || "Open"} | Due ${delivery.scheduled_date ? fmtDate(delivery.scheduled_date) : "No date"}`,
          badge: delivery.status || "OPEN",
          tone: isDeliveryLate(delivery) ? "danger" : "accent",
          page: "Deliveries",
        })),
    ].slice(0, 8);

    const changeFeed = (recentActivity || []).slice(0, 8).map((item, index) => {
      const timestamp = item.timestamp ? new Date(item.timestamp) : null;
      const ageHours = timestamp ? Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 3600000)) : null;
      return {
        key: item.id || `activity-${index}`,
        title: item.title || item.action || item.entity_type || "Activity",
        detail: item.description || item.message || item.entity_name || "Recent project update",
        when: ageHours == null ? "Recent" : ageHours <= 1 ? "<1h" : `${ageHours}h`,
      };
    });

    const blocked = [
      {
        label: "Overdue RFIs",
        value: overdueRfis.length,
        detail: `${upcomingRfis.length} more due in 3 days`,
        color: overdueRfis.length ? "var(--status-error)" : "var(--text-muted)",
        page: "RFIs",
      },
      {
        label: "Late Drawings",
        value: lateDrawings.length,
        detail: `${pendingRevisions.length} active revisions in review`,
        color: lateDrawings.length ? "var(--status-error)" : "var(--accent)",
        page: "Drawings",
      },
      {
        label: "Blocked WPs",
        value: blockedWps.length,
        detail: `${stalledPackages.length} stalled with 0% progress`,
        color: blockedWps.length ? "var(--status-warning)" : "var(--text-muted)",
        page: "WorkPackages",
      },
      {
        label: "Pending Cost",
        value: `$${Math.round(pendingCosts).toLocaleString()}`,
        detail: `$${Math.round(financials.pendingCOVal).toLocaleString()} pending CO exposure`,
        color: pendingCosts > 0 ? "var(--accent)" : "var(--text-muted)",
        page: "Financials",
      },
    ];

    return {
      overdueRfis,
      lateDrawings,
      lateDeliveries,
      blockedWps,
      overdueConstraints,
      attentionItems,
      myItems,
      changeFeed,
      blocked,
    };
  }, [rfis, drawings, deliveries, wps, actionItems, financials, recentActivity, today, userTokens]);
  const stats = [
    {
      label: "Needs Attention",
      value: derived.attentionItems.length,
      subtext: `${derived.overdueRfis.length} overdue RFIs and ${derived.lateDeliveries.length} late deliveries`,
      color: derived.attentionItems.length ? "var(--status-error)" : "var(--status-success)",
    },
    {
      label: "Changes Since Yesterday",
      value: derived.changeFeed.length,
      subtext: recentActivity?.length ? "Live activity feed is flowing" : "No recent activity posted",
      color: "var(--accent)",
    },
    {
      label: "Blocked / At Risk",
      value: derived.blockedWps.length + derived.lateDrawings.length + derived.overdueConstraints.length,
      subtext: `${derived.overdueConstraints.length} constraints and ${derived.lateDrawings.length} drawing holds`,
      color:
        derived.blockedWps.length + derived.lateDrawings.length + derived.overdueConstraints.length
          ? "var(--status-warning)"
          : "var(--text-muted)",
    },
    {
      label: "My Next Actions",
      value: derived.myItems.length,
      subtext: user?.full_name || user?.email || "Signed-in user",
      color: derived.myItems.length ? "var(--accent)" : "var(--text-muted)",
    },
  ];

  const quickActions = [
    { label: "Update RFIs", detail: `${rfis.filter((r) => !["Answered", "Closed"].includes(r.status)).length} open`, page: "RFIs", primary: true },
    { label: "Drawing Revisions", detail: `${drawings.filter((d) => d.stage !== "Released").length} active`, page: "Drawings" },
    { label: "Deliveries", detail: `${deliveries.filter((d) => d.status !== "Delivered").length} in play`, page: "Deliveries" },
    { label: "Work Packages", detail: `${wps.filter((wp) => wp.status !== "Complete").length} active`, page: "WorkPackages" },
    { label: "Costs", detail: `$${Math.round(financials.committedCosts).toLocaleString()} committed`, page: "Financials" },
  ];

  const openPage = (page) => navigate(createPageUrl(page));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ErrorBoundary label="Project Command Strip">
        <ProjectCommandStrip
          project={project}
          wps={wps}
          cos={cos}
          financials={financials}
          onClearProject={onClearProject}
        />
      </ErrorBoundary>

      <ErrorBoundary label="Stats Overview">
        <StatStrip stats={stats} />
      </ErrorBoundary>

      <Card title="Quick Update Rail" tone="accent">
        <QuickActionRail actions={quickActions} onNavigate={openPage} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, alignItems: "start" }}>
        <Card
          title="Needs Attention Today"
          tone="danger"
          count={derived.attentionItems.length}
          action={
            <button
              type="button"
              onClick={() => openPage("AlertsCenter")}
              style={{
                background: "none",
                border: "none",
                color: "var(--status-error)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              All alerts
            </button>
          }
          minHeight={420}
        >
          <WorkList
            items={derived.attentionItems}
            empty="No immediate risk items"
            onOpen={openPage}
          />
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card
            title="My Next Actions"
            tone="accent"
            count={derived.myItems.length}
            action={
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {user?.full_name || user?.email || "Project user"}
              </div>
            }
          >
            <WorkList items={derived.myItems} empty="No directly assigned actions found" onOpen={openPage} />
          </Card>

          <Card title="Blocked / At Risk" tone="warning">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {derived.blocked.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => openPage(item.page)}
                  style={{
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderTop: `2px solid ${item.color}`,
                    borderRadius: "var(--radius-card)",
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: item.color,
                      marginBottom: 4,
                    }}
                  >
                    {item.value}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.detail}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <Card title="Changed Since Yesterday" tone="accent" count={derived.changeFeed.length}>
          <FeedList items={derived.changeFeed} />
        </Card>
        <Card title="Execution Snapshot" tone="accent">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <ErrorBoundary label="Steel Execution Status">
              <SteelExecutionStatusCard wps={wps} drawings={drawings} />
            </ErrorBoundary>
            <ErrorBoundary label="Financial Snapshot">
              <FinancialSnapshotCard financials={financials} cos={cos} />
            </ErrorBoundary>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "stretch" }}>
        <ErrorBoundary label="Upcoming Deliveries">
          <UpcomingDeliveriesCard deliveries={deliveries} />
        </ErrorBoundary>
        <ErrorBoundary label="Drawing Approval Status">
          <DrawingApprovalStatusCard drawings={drawings} />
        </ErrorBoundary>
        <Card title="What Needs Action Next" tone="warning">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                label: "Open RFIs",
                value: rfis.filter((r) => !["Answered", "Closed"].includes(r.status)).length,
                detail: `${derived.overdueRfis.length} overdue`,
                page: "RFIs",
              },
              {
                label: "Pending revisions",
                value: drawings.filter((d) => d.stage !== "Released").length,
                detail: `${derived.lateDrawings.length} late`,
                page: "Drawings",
              },
              {
                label: "Open deliveries",
                value: deliveries.filter((d) => d.status !== "Delivered").length,
                detail: `${derived.lateDeliveries.length} late`,
                page: "Deliveries",
              },
              {
                label: "Active work packages",
                value: wps.filter((wp) => wp.status !== "Complete").length,
                detail: `${derived.blockedWps.length} blocked`,
                page: "WorkPackages",
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openPage(item.page)}
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-card)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.detail}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 20,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                  }}
                >
                  {item.value}
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <ErrorBoundary label="Budget Overview Chart">
        <BudgetOverviewChart
          summary={{
            budget: financials.budgetCommitted,
            actual: financials.actualSpend,
            forecast: financials.committedCosts,
          }}
        />
      </ErrorBoundary>
    </div>
  );
}
