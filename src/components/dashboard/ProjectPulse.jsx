import React, { useMemo } from "react";

const HEALTH = {
  CRITICAL: {
    key: "CRITICAL",
    color: "var(--status-error)",
    bg: "var(--danger-muted)",
    border: "var(--danger-border)",
    gradient: "linear-gradient(180deg, var(--status-error) 0%, var(--status-error) 100%)",
    label: "CRITICAL",
    icon: "\u26A0",
  },
  WARNING: {
    key: "WARNING",
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
    gradient: "linear-gradient(180deg, var(--status-warning) 0%, var(--status-warning) 100%)",
    label: "CAUTION",
    icon: "\u26A0",
  },
  HEALTHY: {
    key: "HEALTHY",
    color: "var(--status-success)",
    bg: "var(--bg-surface)",
    border: "var(--border-default)",
    gradient: "linear-gradient(180deg, var(--status-success) 0%, var(--status-success) 100%)",
    label: "HEALTHY",
    icon: "\u2705",
  },
};

const pulseKeyframes = `
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}
`;

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return "$0";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function pct(num, den) {
  if (!den || den === 0) return 0;
  return Math.round((num / den) * 100);
}

function computeMetrics({ rfis, workPackages, drawings, deliveries, changeOrders, actionItems }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const safeRfis = safeArray(rfis);
  const safeWPs = safeArray(workPackages);
  const safeDrawings = safeArray(drawings);
  const safeDeliveries = safeArray(deliveries);
  const safeCOs = safeArray(changeOrders);
  const safeActions = safeArray(actionItems);

  // RFIs
  const openRfis = safeRfis.filter(
    (r) => r.status !== "Closed" && r.status !== "Void"
  );
  const overdueRfis = safeRfis.filter((r) => {
    if (r.status === "Closed" || r.status === "Void") return false;
    const due = toDate(r.date_required);
    return due && due < today;
  });

  // Work Packages
  const blockedPackages = safeWPs.filter(
    (w) => w.status === "Blocked" || w.status === "At Risk"
  );
  const fabricationTonnage = safeWPs.reduce((sum, w) => {
    if (w.phase === "Fabrication") return sum + (Number(w.tonnage) || 0);
    return sum;
  }, 0);
  const totalTonnage = safeWPs.reduce(
    (sum, w) => sum + (Number(w.tonnage) || 0),
    0
  );

  // Drawings
  const lateDrawings = safeDrawings.filter((d) => {
    if (d.current_stage === "Released") return false;
    const due = toDate(d.due_date);
    return due && due < today;
  });

  // Change Orders
  const pendingCOs = safeCOs.filter(
    (c) => c.status !== "Approved" && c.status !== "Rejected"
  );
  const coExposure = pendingCOs.reduce(
    (sum, c) => sum + (Number(c.amount) || 0),
    0
  );

  // Deliveries
  const lateDeliveries = safeDeliveries.filter((d) => {
    if (d.status === "Delivered") return false;
    const sched = toDate(d.scheduled_date);
    return sched && sched < today;
  });
  const upcomingDeliveries = safeDeliveries.filter((d) => {
    if (d.status === "Delivered") return false;
    const sched = toDate(d.scheduled_date);
    if (!sched || sched < today) return false;
    const weekOut = new Date(today);
    weekOut.setDate(weekOut.getDate() + 7);
    return sched <= weekOut;
  });

  // Action Items
  const overdueActions = safeActions.filter((a) => {
    if (a.status === "Done" || a.status === "Complete" || a.status === "Cancelled") return false;
    const due = toDate(a.due_date);
    return due && due < today;
  });
  const criticalActions = safeActions.filter(
    (a) =>
      (a.priority === "Critical" || a.priority === "High") &&
      a.status !== "Done" &&
      a.status !== "Complete" &&
      a.status !== "Cancelled"
  );

  return {
    openRfis,
    overdueRfis,
    blockedPackages,
    fabricationTonnage,
    totalTonnage,
    lateDrawings,
    pendingCOs,
    coExposure,
    lateDeliveries,
    upcomingDeliveries,
    overdueActions,
    criticalActions,
    totalRfis: safeRfis.length,
    totalWPs: safeWPs.length,
    totalDrawings: safeDrawings.length,
    totalDeliveries: safeDeliveries.length,
    totalCOs: safeCOs.length,
    totalActions: safeActions.length,
  };
}

function determineHealth(m) {
  if (m.overdueRfis.length > 3 || m.blockedPackages.length > 2 || m.lateDrawings.length > 5) {
    return HEALTH.CRITICAL;
  }
  if (
    m.overdueRfis.length > 0 ||
    m.blockedPackages.length > 0 ||
    m.lateDrawings.length > 2 ||
    m.pendingCOs.length > 2
  ) {
    return HEALTH.WARNING;
  }
  return HEALTH.HEALTHY;
}

function buildNarrative(project, metrics, health) {
  const m = metrics;
  const name = project?.name || "Project";
  const contractVal = project?.contract_value
    ? formatCurrency(project.contract_value)
    : null;

  const fabPct = pct(m.fabricationTonnage, m.totalTonnage);
  const resolvedRfis = m.totalRfis - m.openRfis.length;

  // Identify the #1 risk by priority
  const risks = [];
  if (m.overdueRfis.length > 0) {
    risks.push({
      weight: m.overdueRfis.length * 10,
      text: buildRfiRisk(m),
    });
  }
  if (m.lateDrawings.length > 0) {
    risks.push({
      weight: m.lateDrawings.length * 8,
      text: `**${m.lateDrawings.length} drawing${m.lateDrawings.length === 1 ? " is" : "s are"} past due** and need${m.lateDrawings.length === 1 ? "s" : ""} expedited review`,
    });
  }
  if (m.blockedPackages.length > 0) {
    risks.push({
      weight: m.blockedPackages.length * 9,
      text: buildBlockedRisk(m),
    });
  }
  if (m.coExposure > 0) {
    risks.push({
      weight: m.pendingCOs.length * 5,
      text: `**${formatCurrency(m.coExposure)}** in pending change orders need${m.pendingCOs.length === 1 ? "s" : ""} approval`,
    });
  }
  if (m.overdueActions.length > 0) {
    risks.push({
      weight: m.overdueActions.length * 4,
      text: `**${m.overdueActions.length} action item${m.overdueActions.length === 1 ? " is" : "s are"}** overdue`,
    });
  }

  risks.sort((a, b) => b.weight - a.weight);

  // Build the message
  let opener;
  if (health.key === "CRITICAL") {
    opener = contractVal
      ? `**\u26A0 CRITICAL**: ${contractVal} ${name} contract requires immediate attention.`
      : `**\u26A0 CRITICAL**: ${name} requires immediate attention.`;
  } else if (health.key === "WARNING") {
    opener = contractVal
      ? `**${contractVal} contract is ON TRACK**, but risks are emerging.`
      : `**${name} is ON TRACK**, but risks are emerging.`;
  } else {
    opener = contractVal
      ? `**\u2705 HEALTHY**: ${contractVal} ${name} contract is performing well.`
      : `**\u2705 HEALTHY**: ${name} is performing well.`;
  }

  let body = "";
  if (risks.length > 0) {
    body = " " + risks[0].text + ".";
    if (risks.length > 1) {
      body += " Additionally, " + risks[1].text.replace(/^\*\*/, "").replace(/\*\*/, "") + ".";
    }
  } else if (health.key === "HEALTHY") {
    const parts = [];
    if (m.totalRfis > 0) parts.push(`All ${resolvedRfis} RFI${resolvedRfis !== 1 ? "s" : ""} resolved`);
    if (m.totalTonnage > 0) parts.push(`fabrication at **${fabPct}%** complete`);
    body = parts.length > 0 ? " " + parts.join(", ") + "." : "";
  }

  let closer = "";
  if (health.key === "CRITICAL") {
    if (m.overdueRfis.length > 0) {
      const topRfi = m.overdueRfis[0];
      const rfiRef = topRfi.rfi_number ? ` RFI #${topRfi.rfi_number}` : " overdue RFIs";
      closer = ` Prioritize${rfiRef} response to unblock downstream fabrication.`;
    } else if (m.blockedPackages.length > 0) {
      closer = " Escalate blocked work packages to prevent schedule slip.";
    } else {
      closer = " Immediate review needed to prevent cascading delays.";
    }
  } else if (health.key === "WARNING") {
    if (m.blockedPackages.length > 0) {
      const wpName = m.blockedPackages[0].package_name || "blocked packages";
      closer = ` Resolve blockers on ${wpName} this week to hold schedule.`;
    } else if (m.overdueRfis.length > 0) {
      closer = " If not resolved this week, expect downstream fabrication delays.";
    } else if (m.pendingCOs.length > 0) {
      closer = " Expedite CO approvals to maintain budget certainty.";
    } else {
      closer = " Monitor closely to prevent escalation.";
    }
  } else {
    if (m.upcomingDeliveries.length > 0) {
      closer = ` ${m.upcomingDeliveries.length} pending deliver${m.upcomingDeliveries.length === 1 ? "y" : "ies"} scheduled for next week \u2014 confirm logistics with vendor.`;
    } else if (m.totalTonnage > 0 && fabPct < 100) {
      closer = " Maintain current velocity to hit milestones on schedule.";
    }
  }

  return opener + body + closer;
}

function buildRfiRisk(m) {
  const count = m.overdueRfis.length;
  // Try to identify what the RFIs are blocking
  const ballInCourts = m.overdueRfis
    .map((r) => r.ball_in_court)
    .filter(Boolean);
  const uniqueParties = [...new Set(ballInCourts)];

  let detail = `**${count} overdue RFI${count === 1 ? "" : "s"}**`;
  if (m.blockedPackages.length > 0) {
    const wpName = m.blockedPackages[0].package_name;
    if (wpName) {
      detail += ` ${count === 1 ? "is" : "are"} blocking ${wpName} fabrication release`;
    } else {
      detail += ` ${count === 1 ? "is" : "are"} blocking fabrication release`;
    }
  } else if (uniqueParties.length > 0) {
    detail += ` awaiting response from ${uniqueParties.slice(0, 2).join(" and ")}`;
  }
  return detail;
}

function buildBlockedRisk(m) {
  const count = m.blockedPackages.length;
  const names = m.blockedPackages
    .map((w) => w.package_name)
    .filter(Boolean)
    .slice(0, 2);
  let detail = `**${count} work package${count === 1 ? " is" : "s are"} blocked**`;
  if (names.length > 0) {
    detail += ` (${names.join(", ")})`;
  }
  return detail;
}

function buildPills(metrics) {
  const pills = [];
  const m = metrics;

  if (m.overdueRfis.length > 0) {
    pills.push({
      label: `${m.overdueRfis.length} OVERDUE RFI${m.overdueRfis.length === 1 ? "" : "s"}`,
      color: "var(--status-error)",
    });
  }

  if (m.blockedPackages.length > 0) {
    pills.push({
      label: `${m.blockedPackages.length} BLOCKED WP${m.blockedPackages.length === 1 ? "" : "s"}`,
      color: "var(--status-error)",
    });
  }

  if (m.lateDrawings.length > 0) {
    pills.push({
      label: `${m.lateDrawings.length} LATE DWG${m.lateDrawings.length === 1 ? "" : "s"}`,
      color: "var(--status-warning)",
    });
  }

  if (m.coExposure > 0) {
    pills.push({
      label: `${formatCurrency(m.coExposure)} CO EXPOSURE`,
      color: "var(--status-warning)",
    });
  }

  if (m.overdueActions.length > 0) {
    pills.push({
      label: `${m.overdueActions.length} OVERDUE ACTION${m.overdueActions.length === 1 ? "" : "s"}`,
      color: "var(--status-warning)",
    });
  }

  if (m.totalTonnage > 0) {
    const fabPct = pct(m.fabricationTonnage, m.totalTonnage);
    pills.push({
      label: `FAB ${fabPct}%`,
      color: fabPct >= 75 ? "var(--status-success)" : "var(--accent)",
    });
  }

  if (m.openRfis.length > 0 && m.overdueRfis.length === 0) {
    pills.push({
      label: `${m.openRfis.length} OPEN RFI${m.openRfis.length === 1 ? "" : "s"}`,
      color: "var(--accent)",
    });
  }

  if (m.upcomingDeliveries.length > 0) {
    pills.push({
      label: `${m.upcomingDeliveries.length} DELIVERY THIS WEEK`,
      color: "var(--accent)",
    });
  }

  // Cap at 5 pills
  return pills.slice(0, 5);
}

function renderMarkdownBold(text) {
  // Split on **...** patterns and render <strong> tags
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong key={i} style={{ color: "var(--accent)", fontWeight: 700 }}>
          {part}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ProjectPulse({
  project,
  rfis,
  workPackages,
  drawings,
  deliveries,
  changeOrders,
  actionItems,
}) {
  const metrics = useMemo(
    () =>
      computeMetrics({
        rfis,
        workPackages,
        drawings,
        deliveries,
        changeOrders,
        actionItems,
      }),
    [rfis, workPackages, drawings, deliveries, changeOrders, actionItems]
  );

  const health = useMemo(() => determineHealth(metrics), [metrics]);

  const narrative = useMemo(
    () => buildNarrative(project, metrics, health),
    [project, metrics, health]
  );

  const pills = useMemo(() => buildPills(metrics), [metrics]);

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Gradient left border */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 4,
            background: health.gradient,
            borderRadius: "12px 0 0 12px",
          }}
        />

        <div style={{ padding: "14px 16px 12px 20px" }}>
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {/* Pulse dot */}
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: health.color,
                boxShadow: `0 0 6px ${health.color}`,
                animation: "pulse-dot 2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              AI Project Pulse
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: health.color,
                background: `${health.color}18`,
                border: `1px solid ${health.color}40`,
                borderRadius: 4,
                padding: "2px 7px",
                letterSpacing: "0.08em",
              }}
            >
              {health.label}
            </span>
          </div>

          {/* Narrative text */}
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--text-primary)",
              marginBottom: pills.length > 0 ? 12 : 0,
            }}
          >
            {renderMarkdownBold(narrative)}
          </div>

          {/* Metric pills */}
          {pills.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                paddingTop: 4,
                borderTop: "1px solid var(--border-default)",
              }}
            >
              {pills.map((pill, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: pill.color,
                    background: `${pill.color}12`,
                    border: `1px solid ${pill.color}30`,
                    borderRadius: 4,
                    padding: "3px 7px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pill.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
