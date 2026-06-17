// ── Presentational toolbar pieces for ScheduleGantt ──────────────────────
//
// The pure, data-display rows of the Gantt toolbar, extracted so the giant
// container isn't carrying their markup inline. Each is presentational: it
// takes computed numbers (and, for the filters, an onSelect callback) and
// renders — no schedule state, no closures. Markup + styles are byte-identical
// to the originals; the handler-entangled toggle/scroll/zoom buttons stay in
// the container (they'd need ~40 props here, which would couple more than it
// decouples).
import { GANTT_STATUS_HEX } from "@/lib/ganttTheme";

// Quick-filter definitions live with the chips that render them (the only
// consumer). Moved out of ScheduleGantt verbatim.
export const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "lookahead", label: "14-Day" },
  { key: "critical", label: "Critical" },
  { key: "delayed", label: "Delayed" },
  { key: "stalled", label: "Stalled" },
  { key: "overdue", label: "Overdue" },
  { key: "tbd", label: "TBD" },
  { key: "logic", label: "Logic Gaps" },
  { key: "unassigned", label: "No Owner" },
  { key: "shifted", label: "Variance" },
  { key: "deps", label: "Linked" },
  { key: "unlinked", label: "Unlinked" },
  { key: "milestones", label: "Milestones" },
  { key: "weather", label: "Weather" },
];

/** Top-bar KPI counts (TOTAL / COMPLETE / IN PROGRESS / OVERDUE / CRITICAL, + VARIANCE/TBD when present). */
export function GanttStatsBar({ totalTasks, completeTasks, inProgressTasks, overdueTasks, criticalTasks, shiftedTasks, unscheduledTasks }) {
  const stats = [
    { label: "TOTAL", val: totalTasks, color: "var(--text-secondary)" },
    { label: "COMPLETE", val: completeTasks, color: GANTT_STATUS_HEX.complete },
    { label: "IN PROGRESS", val: inProgressTasks, color: GANTT_STATUS_HEX.inProgress },
    { label: "OVERDUE", val: overdueTasks, color: GANTT_STATUS_HEX.delayed },
    { label: "CRITICAL", val: criticalTasks, color: "var(--status-warning)" },
    ...(shiftedTasks > 0 ? [{ label: "VARIANCE", val: shiftedTasks, color: "var(--status-warning)" }] : []),
    ...(unscheduledTasks > 0 ? [{ label: "TBD", val: unscheduledTasks, color: "var(--status-warning)" }] : []),
  ];
  return (
    <div style={{ display: "flex", gap: 16, flex: 1 }}>
      {stats.map(s => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The quick-filter chip row. `onSelect(key)` is called with the chosen filter key. */
export function GanttQuickFilters({ active, onSelect }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {QUICK_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onSelect(filter.key)}
          style={{
            padding: "5px 9px",
            borderRadius: 999,
            border: active === filter.key ? "1px solid var(--accent)" : "1px solid var(--divider)",
            background: active === filter.key ? "var(--accent-muted)" : "var(--bg-surface-low)",
            color: active === filter.key ? "var(--accent)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

/** The schedule-health metric cards (Health / 14-Day / Stalled / Logic / Owners / Variance / Links / Milestones / Weather). */
export function GanttMetricCards({
  avgProgress, lookaheadTasks, stalledTasks, logicGapTasks, unassignedTasks,
  shiftedTasks, totalShiftDays, dependencyLinks, milestoneTasks, weatherRiskTasks,
}) {
  const cards = [
    { label: "Health", value: `${avgProgress}%`, hint: "avg complete", color: "var(--accent)" },
    { label: "14-Day", value: lookaheadTasks, hint: "handoff", color: lookaheadTasks ? "var(--status-info)" : "var(--text-muted)" },
    { label: "Stalled", value: stalledTasks, hint: "started 0%", color: stalledTasks ? "var(--status-error)" : "var(--text-muted)" },
    { label: "Logic", value: logicGapTasks, hint: "open ends", color: logicGapTasks ? "var(--status-warning)" : "var(--text-muted)" },
    { label: "Owners", value: unassignedTasks, hint: "missing", color: unassignedTasks ? "var(--status-error)" : "var(--text-muted)" },
    { label: "Variance", value: shiftedTasks, hint: `${totalShiftDays}d moved`, color: shiftedTasks ? "var(--status-warning)" : "var(--text-muted)" },
    { label: "Links", value: dependencyLinks, hint: "predecessors", color: dependencyLinks ? "var(--status-info)" : "var(--text-muted)" },
    { label: "Milestones", value: milestoneTasks, hint: "flagged", color: milestoneTasks ? "var(--status-warning)" : "var(--text-muted)" },
    { label: "Weather", value: weatherRiskTasks, hint: "field risk", color: weatherRiskTasks ? "var(--status-error)" : "var(--text-muted)" },
  ];
  return (
    <>
      {cards.map((card) => (
        <div key={card.label} style={{
          minWidth: 104,
          border: "1px solid var(--border-default)",
          borderRadius: 10,
          background: "var(--bg-surface-low)",
          padding: "6px 8px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {card.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: card.color, fontWeight: 900, lineHeight: 1.1 }}>
              {card.value}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {card.hint}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
