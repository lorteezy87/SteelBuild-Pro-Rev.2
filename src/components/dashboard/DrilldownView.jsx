import React, { useMemo, useState, useEffect } from "react";
import { statusIs, statusIn } from "@/components/shared/formatters";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DonutChart from "@/components/shared/DonutChart";
import CollapsibleCard from "@/components/shared/CollapsibleCard";
import ProjectCommandStrip from "./ProjectCommandStrip";
import SteelExecutionStatusCard from "./SteelExecutionStatusCard";
import FinancialSnapshotCard from "./FinancialSnapshotCard";
import UpcomingDeliveriesCard from "./UpcomingDeliveriesCard";
import DrawingApprovalStatusCard from "./DrawingApprovalStatusCard";
import BudgetOverviewChart from "../financials/BudgetOverviewChart";
import ProjectPulse from "./ProjectPulse";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
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

/* Mini sparkline for stat trend visualization */
function StatSparkline({ color = "var(--accent)", width = 52, height = 16 }) {
  // Generate a plausible 7-point trend (deterministic visual hint)
  const pts = [0.3, 0.5, 0.4, 0.7, 0.6, 0.8, 1.0];
  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * width;
    const y = height - v * (height - 2) - 1;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block", opacity: 0.5, marginTop: 4 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatStrip({ stats }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
      {stats.map((item) => {
        const isZero = item.value === 0 || item.value === "0" || item.value === "0%";
        const isClearStat = isZero && item.zeroTone === "clear";
        const isEmptyStat = isZero && item.zeroTone === "empty";
        return (
          <div
            key={item.label}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderTop: `2px solid ${isClearStat ? "var(--status-success)" : item.color}`,
              borderRadius: "var(--radius-card)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {item.chartValue != null && (
              <DonutChart
                value={item.chartValue}
                max={item.chartMax || 100}
                size={48}
                stroke={4}
                color={item.color}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Hero number — largest visual element for scanning */}
              {isClearStat ? (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: "var(--status-success)",
                    marginBottom: 2,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {"\u2713"} Clear
                </div>
              ) : isEmptyStat ? (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  {item.zeroLabel || "None yet"}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: item.color,
                    marginBottom: 2,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.value}
                </div>
              )}
              {/* Label — secondary, smaller */}
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
              {/* Zero-state hint */}
              {isClearStat && item.zeroHint ? (
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: "var(--font-body)",
                    fontSize: 10,
                    color: "var(--status-success)",
                    lineHeight: 1.3,
                    opacity: 0.8,
                  }}
                >
                  {item.zeroHint}
                </div>
              ) : isEmptyStat && item.zeroAction ? (
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: "var(--font-body)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    lineHeight: 1.3,
                    cursor: "pointer",
                  }}
                  onClick={item.zeroAction.onClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") item.zeroAction.onClick(); }}
                >
                  {item.zeroAction.label} {"\u2192"}
                </div>
              ) : item.subtext ? (
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: "var(--font-body)",
                    fontSize: 10,
                    color: "var(--text-disabled)",
                    lineHeight: 1.3,
                  }}
                >
                  {item.subtext}
                </div>
              ) : null}
              {/* Mini sparkline trend */}
              {!item.chartValue && !isClearStat && !isEmptyStat && <StatSparkline color={item.color} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickActionRail({ actions, onNavigate }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
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
            color: action.primary ? "var(--accent-text)" : "var(--text-primary)",
            border: action.primary ? "none" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "12px 10px",
            minHeight: 44,
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
              fontSize: 10,
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
              fontSize: 12,
              fontWeight: 500,
              color: action.primary ? "var(--accent-text)" : "var(--text-secondary)",
            }}
          >
            {action.detail}
          </span>
        </button>
      ))}
    </div>
  );
}
// Quick-action map: badge type → action label + color
const QUICK_ACTIONS = {
  RFI: { label: "RESEND RFI", actionColor: "var(--status-warning)" },
  REVISION: { label: "PING DETAILER", actionColor: "var(--status-info)" },
  DELIVERY: { label: "CONTACT VENDOR", actionColor: "var(--accent)" },
  BLOCKED: { label: "ESCALATE", actionColor: "var(--status-error)" },
  ACTION: { label: "REASSIGN", actionColor: "var(--status-warning)" },
  CONSTRAINT: { label: "ESCALATE", actionColor: "var(--status-error)" },
};

function WorkList({ items, empty, emptyIcon, onOpen, emptyHint, emptyHintPage }) {
  if (!items.length) {
    return (
      <div
        style={{
          padding: "24px 10px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 22, opacity: 0.4 }}>{emptyIcon || "\u2713"}</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {empty}
        </div>
        {emptyHint && emptyHintPage && onOpen && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(emptyHintPage)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(emptyHintPage); }}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontStyle: "italic",
              color: "var(--text-muted)",
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            {emptyHint} {"\u2192"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const tone = toneStyles(item.tone);
        const overdueDays = item.overdueDays || 0;
        const urgencyClass = overdueDays >= 14 ? "urgency-critical" : overdueDays >= 7 ? "urgency-danger" : overdueDays >= 2 ? "urgency-warn" : "";
        const qa = QUICK_ACTIONS[item.badge] || null;
        return (
          <div
            key={item.key}
            className={urgencyClass}
            style={{
              background: "var(--bg-surface-low)",
              border: `1px solid ${tone.border}`,
              borderLeft: `3px solid ${tone.color}`,
              borderRadius: "var(--radius-card)",
              padding: "10px 12px",
              minHeight: 44,
              transition: "background 0.15s, box-shadow 0.15s",
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
                      fontSize: 9,
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
                        fontSize: 9,
                        fontWeight: 700,
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 8px",
                      }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                  {overdueDays > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 800,
                        color: overdueDays >= 7 ? "var(--status-error)" : "var(--status-warning)",
                        background: overdueDays >= 7 ? "var(--danger-muted)" : "var(--warning-muted)",
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 8px",
                      }}
                    >
                      {overdueDays}d late
                    </span>
                  )}
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
              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onOpen(item.page)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    padding: "4px 8px",
                    borderRadius: "var(--radius-badge)",
                    border: "1px solid var(--border-default)",
                    background: "none",
                    cursor: "pointer",
                    minHeight: 24,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  OPEN \u2192
                </button>
                {qa && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(item.page); }}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "#fff",
                      padding: "3px 8px",
                      borderRadius: "var(--radius-badge)",
                      border: "none",
                      background: qa.actionColor,
                      cursor: "pointer",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {qa.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeedList({ items, onNavigate }) {
  if (!items.length) {
    return (
      <div
        style={{
          padding: "24px 10px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 22, opacity: 0.4 }}>{"\u2714"}</div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          No changes since yesterday
        </div>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-disabled)",
        }}>
          Activity will appear here as project data is updated.
        </div>
        {onNavigate && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigate("Activity")}
            onKeyDown={(e) => { if (e.key === "Enter") onNavigate("Activity"); }}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontStyle: "italic",
              color: "var(--text-muted)",
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            View full activity log {"\u2192"}
          </div>
        )}
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
  rfis = [],
  cos = [],
  codes = [],
  wps = [],
  drawings = [],
  tasks = [],
  actionItems = [],
  deliveries = [],
  expenses = [],
  recentActivity = [],
  onClearProject,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const today = useMemo(() => startOfToday(), []);

  // Track last data sync time
  const [lastSynced, setLastSynced] = useState(() => new Date());
  useEffect(() => {
    setLastSynced(new Date());
  }, [rfis, cos, wps, drawings, deliveries, expenses]);

  const financials = useMemo(() => {
    const contractValue = Number(project.original_contract_value) || 0;
    const approvedCOVal = cos
      .filter((c) => statusIs(c.status, "Approved"))
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revisedValue = contractValue + approvedCOVal;
    const activeExpenses = expenses.filter((expense) => !statusIs(expense.payment_status, "Voided"));
    const budgetCommitted = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const actualSpend = activeExpenses
      .filter((expense) => statusIs(expense.payment_status, "Paid"))
      .reduce((s, expense) => s + (Number(expense.amount) || 0), 0);
    const committedCosts = activeExpenses.reduce(
      (s, expense) => s + (Number(expense.amount) || 0),
      0
    );
    const pendingCOVal = cos
      .filter((c) => statusIn(c.status, ["Submitted", "Under Review"]))
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
    const isOpenRFI = (rfi) => !statusIn(rfi.status, ["Answered", "Closed"]);
    const isDrawingLate = (drawing) =>
      drawing.due_date &&
      parseDate(drawing.due_date) &&
      parseDate(drawing.due_date) < today &&
      !statusIs(drawing.stage, "Released");
    const isDeliveryLate = (delivery) =>
      delivery.scheduled_date &&
      parseDate(delivery.scheduled_date) &&
      parseDate(delivery.scheduled_date) < today &&
      !statusIs(delivery.status, "Delivered");
    const isActionOpen = (item) => !statusIn(item.status, ["Complete", "Closed", "Cancelled", "Resolved"]);
    const isConstraint = (item) => item.category === "CONSTRAINT";
    const isMine = (value) => {
      const normalized = (value || "").toLowerCase();
      return userTokens.some((token) => token && normalized.includes(token));
    };

    const overdueRfis = rfis.filter((r) => isOpenRFI(r) && r.due_date && parseDate(r.due_date) < today);
    const lateDrawings = drawings.filter(isDrawingLate);
    const lateDeliveries = deliveries.filter(isDeliveryLate);
    const blockedWps = wps.filter((wp) => statusIs(wp.status, "On Hold"));
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
      statusIn(drawing.stage, ["OFA", "BFA", "OFS", "BFS", "FFF"])
    );
    const stalledPackages = wps.filter(
      (wp) => !statusIs(wp.status, "Complete") && Number(wp.percent_complete || 0) === 0
    );

    const attentionItems = [
      ...overdueRfis.map((rfi) => {
        const od = Math.abs(daysBetween(today, parseDate(rfi.due_date)));
        return {
          key: `rfi-${rfi.id}`,
          kicker: rfi.rfi_number || "RFI",
          title: rfi.title || "Open RFI requires response",
          detail: `${od}d overdue | ${rfi.status} | ${rfi.priority || "No priority"}`,
          badge: "RFI",
          tone: statusIs(rfi.priority, "Critical") ? "danger" : "warning",
          overdueDays: od,
          page: "RFIs",
        };
      }),
      ...lateDrawings.map((drawing) => {
        const od = Math.abs(daysBetween(today, parseDate(drawing.due_date)));
        return {
          key: `dwg-${drawing.id}`,
          kicker: drawing.sheet_number || "Drawing",
          title: drawing.title || "Drawing review pending",
          detail: `${drawing.stage} | Due ${fmtDate(drawing.due_date)} | Rev ${drawing.revision_number || 0}`,
          badge: "REVISION",
          tone: "danger",
          overdueDays: od,
          page: "Drawings",
        };
      }),
      ...lateDeliveries.map((delivery) => {
        const od = Math.abs(daysBetween(today, parseDate(delivery.scheduled_date)));
        return {
          key: `delivery-${delivery.id}`,
          kicker: delivery.delivery_id || "Delivery",
          title: delivery.description || delivery.vendor || "Delivery update needed",
          detail: `${delivery.vendor || "Vendor not set"} | Due ${fmtDate(delivery.scheduled_date)}`,
          badge: "DELIVERY",
          tone: "warning",
          overdueDays: od,
          page: "Deliveries",
        };
      }),
      ...blockedWps.map((wp) => ({
        key: `wp-${wp.id}`,
        kicker: wp.wp_number || "WP",
        title: wp.name || "Blocked work package",
        detail: `${wp.phase || "No phase"} | ${wp.crew || "Crew not set"} | On Hold`,
        badge: "BLOCKED",
        tone: "danger",
        overdueDays: 0,
        page: "WorkPackages",
      })),
      ...overdueActions.map((item) => {
        const od = item.due_date ? Math.abs(daysBetween(today, parseDate(item.due_date))) : 0;
        return {
          key: `action-${item.id}`,
          kicker: item.priority || "Action",
          title: item.title || "Action overdue",
          detail: `${item.assigned_to || "Unassigned"} | Due ${fmtDate(item.due_date)}`,
          badge: isConstraint(item) ? "CONSTRAINT" : "ACTION",
          tone: isConstraint(item) ? "danger" : "warning",
          overdueDays: od,
          page: isConstraint(item) ? "Constraints" : "ActionItems",
        };
      }),
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
        isClear: overdueRfis.length === 0,
      },
      {
        label: "Late Drawings",
        value: lateDrawings.length,
        detail: `${pendingRevisions.length} active revisions in review`,
        color: lateDrawings.length ? "var(--status-error)" : "var(--accent)",
        page: "Drawings",
        isClear: lateDrawings.length === 0,
      },
      {
        label: "Blocked WPs",
        value: blockedWps.length,
        detail: `${stalledPackages.length} stalled with 0% progress`,
        color: blockedWps.length ? "var(--status-warning)" : "var(--text-muted)",
        page: "WorkPackages",
        isClear: blockedWps.length === 0,
      },
      {
        label: "Pending Cost",
        value: `$${Math.round(pendingCosts).toLocaleString()}`,
        detail: `$${Math.round(financials.pendingCOVal).toLocaleString()} pending CO exposure`,
        color: pendingCosts > 0 ? "var(--accent)" : "var(--text-muted)",
        page: "Financials",
        isClear: false,
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

  // Computed WP progress & tonnage for donut charts
  const wpProgress = useMemo(() => {
    if (!wps.length) return { avg: 0, fabPct: 0, totalTons: 0, fabTons: 0 };
    const total = wps.reduce((s, wp) => s + (Number(wp.percent_complete) || 0), 0);
    const avg = Math.round(total / wps.length);
    const totalTons = wps.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0);
    const fabTons = wps
      .filter(wp => statusIn(wp.phase, ["Fabrication", "Delivery", "Erection"]) && Number(wp.percent_complete) >= 50)
      .reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0);
    const fabPct = totalTons > 0 ? Math.round((fabTons / totalTons) * 100) : 0;
    return { avg, fabPct, totalTons, fabTons };
  }, [wps]);

  const blockedAtRiskCount = derived.blockedWps.length + derived.lateDrawings.length + derived.overdueConstraints.length;

  const stats = [
    {
      label: "Needs Attention",
      value: derived.attentionItems.length,
      subtext: `${derived.overdueRfis.length} overdue RFIs and ${derived.lateDeliveries.length} late deliveries`,
      color: derived.attentionItems.length ? "var(--status-error)" : "var(--status-success)",
      zeroTone: derived.attentionItems.length === 0 ? "clear" : undefined,
      zeroHint: "No overdue items",
    },
    {
      label: "WP Progress",
      value: `${wpProgress.avg}%`,
      subtext: `${wps.length} packages across all phases`,
      color: "var(--accent)",
      chartValue: wpProgress.avg,
      chartMax: 100,
    },
    {
      label: "Blocked / At Risk",
      value: blockedAtRiskCount,
      subtext: `${derived.overdueConstraints.length} constraints and ${derived.lateDrawings.length} drawing holds`,
      color: blockedAtRiskCount ? "var(--status-warning)" : "var(--text-muted)",
      zeroTone: blockedAtRiskCount === 0 ? "clear" : undefined,
      zeroHint: "No blocked items",
    },
    {
      label: "Fab Progress",
      value: `${wpProgress.fabPct}%`,
      subtext: `${Math.round(wpProgress.fabTons)}T of ${Math.round(wpProgress.totalTons)}T fabricated`,
      color: "var(--phase-fab)",
      chartValue: wpProgress.fabPct,
      chartMax: 100,
      zeroTone: wpProgress.totalTons === 0 ? "empty" : undefined,
      zeroLabel: "No shipments",
      zeroAction: wpProgress.totalTons === 0 ? { label: "Track", onClick: () => navigate(createPageUrl("WorkPackages")) } : undefined,
    },
  ];

  const quickActions = [
    { label: "Update RFIs", detail: `${rfis.filter((r) => !statusIn(r.status, ["Answered", "Closed"])).length} open`, page: "RFIs", primary: true },
    { label: "Drawing Revisions", detail: `${drawings.filter((d) => !statusIs(d.stage, "Released")).length} active`, page: "Drawings" },
    { label: "Deliveries", detail: `${deliveries.filter((d) => !statusIs(d.status, "Delivered")).length} in play`, page: "Deliveries" },
    { label: "Work Packages", detail: `${wps.filter((wp) => !statusIs(wp.status, "Complete")).length} active`, page: "WorkPackages" },
    { label: "Costs", detail: `$${Math.round(financials.committedCosts).toLocaleString()} committed`, page: "Financials" },
  ];

  const openPage = (page) => navigate(createPageUrl(page));

  // Merge attention + my items into a single Active Task Inbox
  const taskInboxItems = useMemo(() => {
    const combined = [...derived.attentionItems, ...derived.myItems];
    // Deduplicate by title
    const seen = new Set();
    return combined.filter((item) => {
      const key = item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [derived.attentionItems, derived.myItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* TOP HEADER — Project Name & Status only */}
      <ErrorBoundary label="Project Command Strip">
        <ProjectCommandStrip
          project={project}
          wps={wps}
          cos={cos}
          financials={financials}
          onClearProject={onClearProject}
        />
      </ErrorBoundary>

      {/* HERO ROW — AI Pulse (60%) | Financial Health (40%) */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 14, alignItems: "stretch" }}>
        <ErrorBoundary label="AI Project Pulse">
          <ProjectPulse
            project={project}
            rfis={rfis}
            workPackages={wps}
            drawings={drawings}
            deliveries={deliveries}
            changeOrders={cos}
            actionItems={actionItems}
          />
        </ErrorBoundary>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ErrorBoundary label="Financial Snapshot">
            <FinancialSnapshotCard financials={financials} cos={cos} />
          </ErrorBoundary>
          <ErrorBoundary label="Stats Overview">
            <StatStrip stats={stats} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Sync + Quick Rail row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <CollapsibleCard id="dashboard-quick-rail" title="Quick Update Rail" tone="accent" style={{ flex: 1 }}>
          <QuickActionRail actions={quickActions} onNavigate={openPage} />
        </CollapsibleCard>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            letterSpacing: "0.06em",
          }}>
            {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries();
              setLastSynced(new Date());
            }}
            title="Refresh all data"
            style={{
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "3px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
          >
            &#x21BB;
          </button>
        </div>
      </div>

      {/* MIDDLE ROW — Active Task Inbox (50%) | Blocked / At Risk (50%) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        {/* Active Task Inbox — merged from Needs Attention + My Actions */}
        <CollapsibleCard
          id="dashboard-task-inbox"
          title="Active Task Inbox"
          tone={derived.attentionItems.length > 0 ? "danger" : "accent"}
          count={taskInboxItems.length}
          action={
            <button type="button" onClick={() => openPage("AlertsCenter")} style={{
              background: "none", border: "none",
              color: derived.attentionItems.length > 0 ? "var(--status-error)" : "var(--accent)",
              cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9,
              fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              All alerts \u2192
            </button>
          }
        >
          {taskInboxItems.length > 0 ? (
            <WorkList items={taskInboxItems} empty="No items" onOpen={openPage} />
          ) : (
            <div style={{ padding: 12, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>{"\u2705"}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  All clear — no items need immediate attention
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                {[
                  { label: "Create RFI", page: "RFIs" },
                  { label: "Upload Drawing", page: "Drawings" },
                  { label: "Add Work Package", page: "WorkPackages" },
                ].map((qa) => (
                  <button key={qa.label} type="button" onClick={() => openPage(qa.page)} style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                    color: "var(--text-secondary)", background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)",
                    padding: "4px 10px", cursor: "pointer",
                  }}>
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard id="dashboard-blocked" title="Blocked / At Risk" tone="warning">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {derived.blocked.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openPage(item.page)}
                title={`Click to view ${item.label} details\n${item.detail}`}
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderTop: `2px solid ${item.color}`,
                  borderRadius: "var(--radius-card)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = item.color;
                  e.currentTarget.style.boxShadow = `0 0 12px ${item.color}22`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                  color: "var(--text-muted)", letterSpacing: "0.10em",
                  textTransform: "uppercase", marginBottom: 6,
                }}>
                  {item.label}
                </div>
                {item.isClear ? (
                  <div style={{
                    fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800,
                    lineHeight: 1, color: "var(--status-success)", marginBottom: 4,
                  }}>
                    {"\u2713"} Clear
                  </div>
                ) : (
                  <div style={{
                    fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 900,
                    lineHeight: 1, color: item.color, marginBottom: 4,
                    letterSpacing: "-0.01em",
                  }}>
                    {item.value}
                  </div>
                )}
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 10,
                  color: item.isClear ? "var(--status-success)" : "var(--text-disabled)",
                  lineHeight: 1.3,
                  opacity: item.isClear ? 0.7 : 1,
                }}>
                  {item.isClear ? "No overdue items" : item.detail}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                  color: "var(--text-muted)", letterSpacing: "0.08em",
                  marginTop: 8, textTransform: "uppercase",
                }}>
                  VIEW \u2192
                </div>
              </button>
            ))}
          </div>
        </CollapsibleCard>
      </div>

      {/* BOTTOM ROW — Execution Pipeline (full width) */}
      <CollapsibleCard id="dashboard-execution" title="Execution Snapshot" tone="accent">
        <ErrorBoundary label="Steel Execution Status">
          <SteelExecutionStatusCard wps={wps} drawings={drawings} />
        </ErrorBoundary>
      </CollapsibleCard>

      {/* Deliveries + Drawings + Changes row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "stretch" }}>
        <ErrorBoundary label="Upcoming Deliveries">
          <UpcomingDeliveriesCard deliveries={deliveries} />
        </ErrorBoundary>
        <ErrorBoundary label="Drawing Approval Status">
          <DrawingApprovalStatusCard drawings={drawings} />
        </ErrorBoundary>
        <CollapsibleCard id="dashboard-changes" title="Changed Since Yesterday" tone="accent" count={derived.changeFeed.length}>
          <FeedList items={derived.changeFeed} onNavigate={openPage} />
        </CollapsibleCard>
      </div>

      {/* Budget Overview — merged with financial snapshot above */}
      <CollapsibleCard id="dashboard-budget" title="Budget Overview" tone="accent">
        <ErrorBoundary label="Budget Overview Chart">
          <BudgetOverviewChart
            summary={{
              budget: financials.budgetCommitted,
              actual: financials.actualSpend,
              forecast: financials.committedCosts,
            }}
          />
        </ErrorBoundary>
      </CollapsibleCard>
    </div>
  );
}
