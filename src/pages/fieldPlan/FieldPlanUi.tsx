/**
 * Presentational UI for Field Plan board.
 */
// @ts-nocheck
import React from "react";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  HORIZON_OPTIONS,
  UNASSIGNED_CREW,
} from "./fieldPlanHelpers";
import {
  headerCellStyle,
  crewCellStyle,
  dayCellStyle,
  toolBtn,
  fieldPlanBlockerChipColors,
  fieldPlanTaskBorderColor,
} from "./fieldPlanStyleHelpers";

export {
  headerCellStyle,
  crewCellStyle,
  dayCellStyle,
  toolBtn,
} from "./fieldPlanStyleHelpers";

export function BlockerChip({ chip }) {
  const { color, bg } = fieldPlanBlockerChipColors(chip.severity);
  return (
    <span
      title={chip.label}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "1px 5px",
        borderRadius: 3,
        color,
        background: bg,
        border: `1px solid ${color}`,
        whiteSpace: "nowrap",
        textDecoration: chip.resolved ? "line-through" : "none",
        opacity: chip.resolved ? 0.6 : 1,
        maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {chip.type}
    </span>
  );
}

export function TaskCard({ task }) {
  const complete = task.status === "Complete";
  const blocked = task._isBlocked;
  const borderColor = fieldPlanTaskBorderColor(task);

  return (
    <div
      title={task.notes || task.task_name}
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid ${borderColor}`,
        background: complete ? "var(--success-muted)" : "var(--bg-surface)",
        marginBottom: 4,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 600,
        color: complete ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: complete ? "line-through" : "none",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {task.task_name || "Untitled"}
      </div>
      {task.phase && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
          {task.phase}{task.percent_complete ? ` · ${task.percent_complete}%` : ""}
        </div>
      )}
      {task._chips && task._chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 5 }}>
          {task._chips.slice(0, 3).map((chip, i) => (
            <BlockerChip key={i} chip={chip} />
          ))}
          {task._chips.length > 3 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              +{task._chips.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function FieldPlanNoProjectState() {
  return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        Select a project to view the Field Plan
      </div>
    </div>
  );
}

export function HorizonToggle({ horizonDays, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
      {HORIZON_OPTIONS.map((o) => (
        <button
          key={o.days}
          onClick={() => onChange(o.days)}
          style={{
            padding: "6px 12px", border: "none", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            color: horizonDays === o.days ? "var(--accent)" : "var(--text-secondary)",
            background: horizonDays === o.days ? "var(--accent-muted)" : "transparent",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldPlanCommandBar({
  projectName,
  horizonDays,
  onHorizonChange,
  stats,
  subtitle,
  onlyBlocked,
  onToggleBlocked,
  onExportIcs,
  onPrint,
}) {
  return (
    <CommandBar
      eyebrow={`${projectName || "PROJECT"} · FIELD PLAN`}
      title={`${horizonDays}-Day Field Plan`}
      count={stats.total}
      unit=" TASKS"
      subtitle={subtitle}
    >
      <HorizonToggle horizonDays={horizonDays} onChange={onHorizonChange} />
      <button
        onClick={onToggleBlocked}
        title="Show only crews with blocked tasks"
        style={{
          padding: "6px 12px", borderRadius: 6,
          border: onlyBlocked ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
          background: onlyBlocked ? "var(--danger-muted)" : "transparent",
          color: onlyBlocked ? "var(--status-error)" : "var(--text-secondary)",
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
        }}
      >
        {onlyBlocked ? "BLOCKED ONLY" : "ALL CREWS"}
      </button>
      <button onClick={onExportIcs} style={toolBtn}>📅 EXPORT .ICS</button>
      <button onClick={onPrint} style={toolBtn}>🖨 PRINT</button>
    </CommandBar>
  );
}

export function FieldPlanKpis({ stats, crewCount }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Tasks in Window" value={stats.total} color="var(--accent)" />
      <KpiTile compact label="Blocked" value={stats.blocked} color="var(--status-error)" />
      <KpiTile compact label="This Week" value={stats.dueThisWeek} color="var(--status-warning)" />
      <KpiTile compact label="Complete" value={stats.completed} color="var(--status-success)" />
      <KpiTile compact label="Crews" value={crewCount} color="var(--phase-fab)" />
    </div>
  );
}

export function FieldPlanBoard({
  isLoading,
  isError,
  error,
  onRetry,
  tasksLength,
  horizonDays,
  days,
  visibleCrews,
  cellMap,
}) {
  return (
    <PhoenixPanel>
      {isLoading ? (
        <div style={{ padding: 16 }}>
          <LoadingSkeleton variant="table" rows={6} />
        </div>
      ) : isError ? (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          gap: 12,
        }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
            Couldn’t load field plan
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
            {toUserErrorMessage(error, "Something went wrong. Try again.")}
          </p>
          <Button variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      ) : tasksLength === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          No tasks in the next {horizonDays} days. Try a longer horizon, or assign tasks on the Schedule page.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: Math.max(900, 140 + days.length * 180) }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2, background: "var(--bg-sidebar)", minWidth: 140 }}>
                  CREW
                </th>
                {days.map((d) => (
                  <th key={d.iso} style={{
                    ...headerCellStyle,
                    minWidth: 180,
                    background: d.weekday === 0 || d.weekday === 6 ? "var(--bg-surface-high)" : "var(--bg-sidebar)",
                  }}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCrews.map((crew) => (
                <tr key={crew.key}>
                  <td style={{
                    ...crewCellStyle,
                    position: "sticky", left: 0, zIndex: 1,
                    background: "var(--bg-surface-low)",
                    borderLeft: `3px solid ${crew.key === UNASSIGNED_CREW ? "var(--text-muted)" : "var(--accent)"}`,
                  }}>
                    {crew.name}
                  </td>
                  {days.map((d) => {
                    const items = cellMap.get(`${crew.key}|${d.iso}`) || [];
                    const isWeekend = d.weekday === 0 || d.weekday === 6;
                    return (
                      <td key={d.iso} style={{
                        ...dayCellStyle,
                        background: isWeekend ? "rgba(2,6,23,0.015)" : "transparent",
                      }}>
                        {items.length === 0 ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>—</span>
                        ) : items.map((t) => <TaskCard key={t.id} task={t} />)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PhoenixPanel>
  );
}

export function FieldPlanPrintStyle() {
  return (
    <style>{`
      @media print {
        body { background: white !important; }
        .sidebar, .nav, .command-bar-actions, button { display: none !important; }
        .fieldplan-root { padding: 12px !important; }
        table { font-size: 9px !important; }
        th, td { border: 1px solid var(--border-strong) !important; }
      }
    `}</style>
  );
}
