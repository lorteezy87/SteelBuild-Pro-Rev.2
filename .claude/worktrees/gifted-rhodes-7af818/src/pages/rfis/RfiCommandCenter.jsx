import React, { useMemo } from "react";
import { Button, BicPill, Icon, StatusPill } from "@/components/design-system";
import { daysOpen, isOverdue, rfiStatusShortLabel } from "./utils";

const OPEN_STATUSES = new Set(["Open", "Under Review", "Incomplete Response"]);

const FILTER_TILES = [
  { id: "all", label: "All RFIs", key: "all", color: "var(--text-secondary)" },
  { id: "open", label: "Open", key: "open", color: "var(--status-warning)" },
  { id: "review", label: "Review", key: "review", color: "var(--status-review)" },
  { id: "incomplete", label: "Incomplete", key: "incomplete", color: "var(--status-error)" },
  { id: "answered", label: "Answered", key: "answered", color: "var(--status-success)" },
  { id: "closed", label: "Closed", key: "closed", color: "var(--text-muted)" },
];

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(value) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86400000);
}

function dueLabel(rfi) {
  const diff = daysUntil(rfi.date_required);
  if (diff === null) return { label: "No due date", late: false };
  if (isOverdue(rfi)) return { label: `${Math.abs(diff)}d late`, late: true };
  if (diff === 0) return { label: "Due today", late: true };
  if (diff <= 3) return { label: `Due in ${diff}d`, late: false };
  return { label: formatDate(rfi.date_required), late: false };
}

function impactLabel(rfi) {
  const cost = rfi.cost_impact && rfi.cost_impact_amount
    ? `$${Number(rfi.cost_impact_amount).toLocaleString()}`
    : null;
  const schedule = rfi.schedule_impact && rfi.schedule_impact_days
    ? `${rfi.schedule_impact_days}d`
    : null;
  return [cost, schedule].filter(Boolean).join(" / ") || "No impact";
}

function riskScore(rfi) {
  const age = daysOpen(rfi);
  const due = daysUntil(rfi.date_required);
  let score = age * 4;
  if (isOverdue(rfi)) score += 900;
  if (due !== null && due >= 0 && due <= 3) score += 280;
  if (rfi.status === "Incomplete Response") score += 420;
  if (rfi.status === "Under Review") score += 140;
  if (rfi.priority === "Critical") score += 520;
  if (rfi.priority === "High") score += 230;
  if (rfi.cost_impact) score += 90;
  if (rfi.schedule_impact) score += 90;
  return score;
}

function percent(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

export default function RfiCommandCenter({
  projectName,
  counts,
  rfis,
  filter,
  onFilterChange,
  onOpenRfi,
  onExport,
  onImport,
  onCreate,
}) {
  const summary = useMemo(() => {
    const active = rfis.filter((rfi) => OPEN_STATUSES.has(rfi.status || "Open"));
    const overdue = active.filter((rfi) => isOverdue(rfi));
    const dueSoon = active.filter((rfi) => {
      const diff = daysUntil(rfi.date_required);
      return diff !== null && diff >= 0 && diff <= 3;
    });
    const critical = active.filter((rfi) => rfi.priority === "Critical");
    const incomplete = active.filter((rfi) => rfi.status === "Incomplete Response");
    const answeredOrClosed = rfis.filter((rfi) => ["Answered", "Closed"].includes(rfi.status)).length;
    const costExposure = active.reduce((sum, rfi) => {
      if (!rfi.cost_impact || !rfi.cost_impact_amount) return sum;
      const value = Number(rfi.cost_impact_amount);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const scheduleExposure = active.reduce((sum, rfi) => {
      if (!rfi.schedule_impact || !rfi.schedule_impact_days) return sum;
      const value = Number(rfi.schedule_impact_days);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    const ballInCourtCounts = active.reduce((acc, rfi) => {
      const key = rfi.ball_in_court || "Contractor";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topBallInCourt = Object.entries(ballInCourtCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      active,
      overdue,
      dueSoon,
      critical,
      incomplete,
      costExposure,
      scheduleExposure,
      responseRate: percent(answeredOrClosed, rfis.length),
      topBallInCourt,
      riskQueue: [...active].sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5),
    };
  }, [rfis]);

  const actionCount = counts.open + counts.review + counts.incomplete;
  const stageTotal = Math.max(rfis.length, 1);

  return (
    <>
      <div className="rfi-command-center">
        <section className="rfi-hero-panel">
          <div className="rfi-hero-content">
            <div>
              <div className="rfi-eyebrow">
                <Icon name="rfi" size={12} />
                {projectName}
              </div>
              <h1 className="rfi-hero-title">RFI Control Center</h1>
              <p className="rfi-hero-copy">
                Track unanswered questions, late responses, owner/engineer ball-in-court, and cost or schedule exposure before they block fabrication or field work.
              </p>
            </div>
            <div className="rfi-hero-actions">
              <Button variant="secondary" icon="download" onClick={onExport}>Export</Button>
              <Button variant="secondary" icon="upload" onClick={onImport}>Import Log</Button>
              <Button variant="primary" icon="plus" onClick={onCreate}>New RFI</Button>
            </div>
          </div>

          <div className="rfi-signal-grid">
            <div className="rfi-primary-metric">
              <span>Need action</span>
              <strong>{actionCount}</strong>
            </div>
            <SignalCard label="Overdue" value={summary.overdue.length} sub="Past required response date" hot={summary.overdue.length > 0} />
            <SignalCard label="Incomplete" value={summary.incomplete.length} sub="Returned but not usable" hot={summary.incomplete.length > 0} />
            <SignalCard label="Critical" value={summary.critical.length} sub="Priority RFIs still active" hot={summary.critical.length > 0} />
            <SignalCard label="Due soon" value={summary.dueSoon.length} sub="Required in the next 3 days" />
            <SignalCard label="Response rate" value={`${summary.responseRate}%`} sub="Answered or closed RFIs" />
            <SignalCard label="Cost exposure" value={summary.costExposure ? `$${summary.costExposure.toLocaleString()}` : "$0"} sub="Active RFIs with cost impact" />
            <SignalCard label="Schedule exposure" value={`${summary.scheduleExposure || 0}d`} sub="Active schedule impact days" />
          </div>
        </section>

        <aside className="rfi-risk-panel">
          <div className="rfi-panel-header">
            <div>
              <div className="rfi-small-label">Decision Queue</div>
              <h2 className="rfi-panel-title">Highest-risk RFIs</h2>
            </div>
            {summary.topBallInCourt && (
              <div className="rfi-top-bic">
                <BicPill bic={summary.topBallInCourt[0]} />
                <span>{summary.topBallInCourt[1]} open</span>
              </div>
            )}
          </div>
          <div className="rfi-risk-list">
            {summary.riskQueue.length > 0 ? (
              summary.riskQueue.map((rfi) => {
                const due = dueLabel(rfi);
                return (
                  <button key={rfi.id} type="button" className="rfi-risk-item" onClick={() => onOpenRfi(rfi)}>
                    <div className="rfi-risk-number">{rfi.rfi_number || "RFI"}</div>
                    <div>
                      <div className="rfi-risk-title">{rfi.title || "Untitled RFI"}</div>
                      <div className="rfi-risk-meta">
                        <BicPill bic={rfi.ball_in_court || "Contractor"} />
                        <StatusPill label={rfiStatusShortLabel(rfi.status)} size="xs" />
                        <span className="rfi-small-label">{impactLabel(rfi)}</span>
                      </div>
                    </div>
                    <div className={`rfi-risk-due${due.late ? " is-late" : ""}`}>{due.label}</div>
                  </button>
                );
              })
            ) : (
              <div className="rfi-signal-sub">No active RFIs need response right now.</div>
            )}
          </div>
        </aside>
      </div>

      <section className="rfi-section-panel">
        <div className="rfi-panel-header">
          <div>
            <div className="rfi-small-label">Lifecycle</div>
            <h2 className="rfi-panel-title">Response flow</h2>
          </div>
          <span className="rfi-small-label">{rfis.length} total RFIs</span>
        </div>
        <div className="rfi-stage-grid">
          {FILTER_TILES.map((tile) => {
            const count = counts[tile.key] || 0;
            const isActive = filter === tile.id;
            return (
              <button
                key={tile.id}
                type="button"
                className={`rfi-stage-card${isActive ? " is-active" : ""}`}
                onClick={() => onFilterChange(tile.id)}
                style={{ "--stage-color": tile.color }}
              >
                <div className="rfi-stage-label">{tile.label}</div>
                <div className="rfi-stage-value">
                  <span className="rfi-stage-count">{count}</span>
                  <span className="rfi-stage-pct">{percent(count, stageTotal)}%</span>
                </div>
                <div className="rfi-stage-track">
                  <div className="rfi-stage-fill" style={{ width: `${percent(count, stageTotal)}%` }} />
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className={`rfi-stage-card${filter === "overdue" ? " is-active" : ""}`}
            onClick={() => onFilterChange("overdue")}
            style={{ "--stage-color": "var(--danger)" }}
          >
            <div className="rfi-stage-label">Overdue</div>
            <div className="rfi-stage-value">
              <span className="rfi-stage-count">{counts.overdue}</span>
              <span className="rfi-stage-pct">{percent(counts.overdue, stageTotal)}%</span>
            </div>
            <div className="rfi-stage-track">
              <div className="rfi-stage-fill" style={{ width: `${percent(counts.overdue, stageTotal)}%` }} />
            </div>
          </button>
          <button
            type="button"
            className={`rfi-stage-card${filter === "critical" ? " is-active" : ""}`}
            onClick={() => onFilterChange("critical")}
            style={{ "--stage-color": "#FF6B35" }}
          >
            <div className="rfi-stage-label">Critical</div>
            <div className="rfi-stage-value">
              <span className="rfi-stage-count">{counts.critical}</span>
              <span className="rfi-stage-pct">{percent(counts.critical, stageTotal)}%</span>
            </div>
            <div className="rfi-stage-track">
              <div className="rfi-stage-fill" style={{ width: `${percent(counts.critical, stageTotal)}%` }} />
            </div>
          </button>
        </div>
      </section>
    </>
  );
}

function SignalCard({ label, value, sub, hot = false }) {
  return (
    <div className={`rfi-signal-card${hot ? " is-hot" : ""}`}>
      <div className="rfi-signal-label">{label}</div>
      <div className="rfi-signal-value">{value}</div>
      <div className="rfi-signal-sub">{sub}</div>
    </div>
  );
}
