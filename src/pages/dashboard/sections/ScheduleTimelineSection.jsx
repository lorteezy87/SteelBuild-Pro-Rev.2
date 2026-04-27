/**
 * ScheduleTimelineSection — top panel of the project dashboard.
 *
 * Three sub-areas:
 *   1. Project timeline progress bar (Start → Target with current
 *      elapsed-percent marker), tinted by overall WP completion so the
 *      bar visually telegraphs schedule-vs-progress drift.
 *   2. Two columns: Key Milestones (placeholder until milestone entity
 *      lands) and Critical Path (placeholder until schedule_tasks
 *      gains a critical_path flag).
 *   3. Work Package Pipeline — 6-stage chevron strip with counts at
 *      every stage. Click a stage to jump into Work Packages filtered
 *      to that status.
 */

import React, { useMemo } from "react";
import { Calendar } from "lucide-react";
import SectionCard from "./SectionCard";
import {
  daysRemaining,
  timelineElapsedPct,
  wpProgressPct,
  wpPipelineRollup,
} from "../projectMetrics";
import { formatDate } from "@/components/shared/formatters";

const STAGE_COLOR = {
  "Not Started": "var(--text-muted)",
  "Detailing":   "var(--status-info)",
  "Released":    "var(--status-warning)",
  "Fabrication": "var(--status-review)",
  "Complete":    "var(--status-success-bright)",
  "Shipped":     "#0d9488",
};

export default function ScheduleTimelineSection({ project, wps = [], onNavigate }) {
  const elapsedPct = useMemo(() => timelineElapsedPct(project), [project]);
  const completePct = useMemo(() => wpProgressPct(wps), [wps]);
  const daysLeft = useMemo(() => daysRemaining(project), [project]);
  const pipeline = useMemo(() => wpPipelineRollup(wps), [wps]);

  const milestones = []; // milestone entity not modeled yet
  const criticalPath = []; // schedule_tasks.critical_path flag not modeled yet

  const start = project?.start_date;
  const target = project?.target_completion_date || project?.forecast_completion_date;

  // Drift is what the user actually cares about — schedule % vs work %.
  // Color the elapsed bar by how badly the project is running behind.
  const drift = elapsedPct - completePct;
  const driftColor =
    drift >= 30 ? "var(--status-error)"
      : drift >= 15 ? "var(--status-warning)"
      : "var(--status-success)";

  const stats = [
    { value: pipeline.total, label: "PACKAGES", color: "accent" },
    { value: milestones.length, label: "MILESTONES", color: "info" },
    { value: 0, label: "OVERDUE", color: "error" },
  ];

  return (
    <SectionCard
      icon={Calendar}
      iconColor="warning"
      title="Schedule & Timeline"
      subtitle="Work packages, milestones, and critical path"
      stats={stats}
    >
      {/* Timeline bar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)", marginBottom: 8,
        }}>
          <span>Start{start ? ` · ${formatDate(start)}` : ""}</span>
          <span>
            Schedule Progress: {elapsedPct}% elapsed
            {Number.isFinite(daysLeft) && daysLeft != null
              ? ` · ${daysLeft} days remaining`
              : ""}
          </span>
          <span>Target{target ? ` · ${formatDate(target)}` : ""}</span>
        </div>
        <div style={{
          position: "relative",
          height: 12,
          background: "var(--bg-surface-low)",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--border-default)",
        }}>
          {/* Elapsed (lower priority — tints the bar grey unless drift) */}
          <div style={{
            position: "absolute", inset: 0,
            width: `${elapsedPct}%`,
            background: driftColor + "33",
            transition: "width 0.3s",
          }} />
          {/* Work complete (foreground) */}
          <div style={{
            position: "absolute", inset: 0,
            width: `${completePct}%`,
            background: "var(--accent)",
            transition: "width 0.3s",
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "center", gap: 16, marginTop: 8,
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-muted)", letterSpacing: "0.06em",
        }}>
          <Legend color="var(--accent)" label="Work Complete" />
          <Legend color={driftColor} label="Time Elapsed" />
          {drift >= 15 && (
            <span style={{ color: driftColor, fontWeight: 700 }}>
              {drift}% behind schedule
            </span>
          )}
        </div>
      </div>

      {/* Milestones / Critical Path */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 18,
      }}>
        <SubPanel title="Key Milestones">
          {milestones.length === 0
            ? <Empty text="No milestones defined" />
            : milestones.map((m) => <div key={m.id}>{m.name}</div>)}
        </SubPanel>
        <SubPanel title="Critical Path">
          {criticalPath.length === 0
            ? <Empty text="No critical path tasks" />
            : criticalPath.map((t) => <div key={t.id}>{t.title}</div>)}
        </SubPanel>
      </div>

      {/* WP Pipeline */}
      <div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)", marginBottom: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>Work Package Pipeline</span>
          {onNavigate && (
            <button
              onClick={() => onNavigate("work-packages")}
              style={LINK_BTN}
            >
              View All →
            </button>
          )}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${pipeline.stages.length}, 1fr)`,
          gap: 4,
        }}>
          {pipeline.stages.map((stage) => (
            <PipelineCell
              key={stage}
              label={stage}
              count={pipeline.counts[stage]}
              color={STAGE_COLOR[stage]}
              onClick={onNavigate ? () => onNavigate("work-packages") : undefined}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function SubPanel({ title, children }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 8,
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{
      fontFamily: "var(--font-body)", fontSize: 12,
      color: "var(--text-muted)", fontStyle: "italic",
      textAlign: "center", padding: "16px 0",
    }}>
      {text}
    </div>
  );
}

function PipelineCell({ label, count, color, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: color + "1A",
        border: `1px solid ${color}33`,
        borderTop: `2px solid ${color}`,
        borderRadius: 6,
        padding: "10px 8px",
        textAlign: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.12s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = color + "33")}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.background = color + "1A")}
    >
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700,
        color, lineHeight: 1,
      }}>
        {count}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", color: "var(--text-secondary)",
        textTransform: "uppercase", marginTop: 6,
      }}>
        {label}
      </div>
    </button>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

const LINK_BTN = {
  background: "none", border: "none", padding: 0,
  color: "var(--accent)",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  cursor: "pointer",
};
