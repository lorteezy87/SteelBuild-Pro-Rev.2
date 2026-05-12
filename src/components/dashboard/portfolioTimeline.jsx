import React from "react";
import { GANTT_PHASE_HEX, GANTT_TODAY_HEX } from "@/lib/ganttTheme";

export const PHASE_DOT = {
  Detailing: GANTT_PHASE_HEX.Detailing,
  Fabrication: GANTT_PHASE_HEX.Fabrication,
  Delivery: GANTT_PHASE_HEX.Delivery,
  "Erection/Installation": GANTT_PHASE_HEX.Erection,
  Closeout: "var(--status-success)",
};

// ── Mini-Gantt support ─────────────────────────────────────────────
//
// The portfolio "Timeline" column shows a compact horizontal strip of
// each project's phase bars on a shared (per-project) time axis.
// Computed entirely from schedule_tasks — we don't need a separate
// phase-spans table.
//
// Canonical phase order + colors. Matches utils/phases.js.
export const TIMELINE_PHASES = [
  "Pre-Construction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Closeout",
];
export const TIMELINE_PHASE_COLOR = {
  "Pre-Construction": GANTT_PHASE_HEX["Pre-Construction"],
  Detailing:          GANTT_PHASE_HEX.Detailing,
  Procurement:        GANTT_PHASE_HEX.Procurement,
  Fabrication:        GANTT_PHASE_HEX.Fabrication,
  Delivery:           GANTT_PHASE_HEX.Delivery,
  Installation:       GANTT_PHASE_HEX.Installation,
  Closeout:           GANTT_PHASE_HEX.Closeout,
};

// Year clamp matches what ScheduleGantt uses — one rogue typo'd year
// can't poison the min/max of the whole portfolio timeline.
export const TIMELINE_MIN_YEAR = 1900;
export const TIMELINE_MAX_YEAR = 2200;
export function parseTaskDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < TIMELINE_MIN_YEAR || y > TIMELINE_MAX_YEAR) return null;
  return d;
}

/**
 * Summarise a project's schedule_tasks into per-phase spans: for each
 * phase that has tasks, returns { start, end } = (earliest task start,
 * latest task end) inside that phase. Also returns the overall min/max
 * for the project so the mini-Gantt knows its X-axis.
 */
export function summarizeProjectSchedule(tasks = []) {
  const phaseMap = {};
  let projectMin = null;
  let projectMax = null;
  for (const t of tasks) {
    const ph = t.phase;
    if (!ph) continue;
    const s = parseTaskDate(t.start_date);
    const e = parseTaskDate(t.end_date);
    if (!s || !e) continue;
    const cur = phaseMap[ph] || { start: s, end: e };
    if (s < cur.start) cur.start = s;
    if (e > cur.end)   cur.end = e;
    phaseMap[ph] = cur;
    if (!projectMin || s < projectMin) projectMin = s;
    if (!projectMax || e > projectMax) projectMax = e;
  }
  const phases = TIMELINE_PHASES
    .map((key) => (phaseMap[key] ? { key, start: phaseMap[key].start, end: phaseMap[key].end } : null))
    .filter(Boolean);
  return { phases, min: projectMin, max: projectMax };
}

/**
 * MiniProjectTimeline — ~170px strip showing phase bars + today marker.
 * Pure visual, no data-fetching. Takes the pre-computed summary from
 * summarizeProjectSchedule() so the parent can memoise once per render.
 */
export function MiniProjectTimeline({ summary, width = 170, height = 22, onPhaseClick, onTimelineClick }) {
  if (!summary || !summary.phases.length || !summary.min || !summary.max) {
    return (
      <div style={{
        width, height,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
        border: "1px dashed var(--divider)", borderRadius: 3,
        letterSpacing: "0.1em",
        cursor: onTimelineClick ? "pointer" : "default",
      }}
      onClick={(e) => { if (onTimelineClick) { e.stopPropagation(); onTimelineClick(); } }}
      >
        NO SCHEDULE
      </div>
    );
  }
  const { phases, min, max } = summary;
  const total = max - min || 1;
  const todayMs = Date.now();
  const todayInRange = todayMs >= min.getTime() && todayMs <= max.getTime();
  const todayX = ((todayMs - min.getTime()) / total) * width;

  return (
    <div
      style={{
        width, height,
        position: "relative",
        background: "var(--sbd-gantt-bg)",
        border: "1px solid var(--sbd-gantt-grid)",
        borderRadius: 3,
        overflow: "hidden",
        cursor: onTimelineClick ? "pointer" : "default",
      }}
      title={`${min.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" })} → ${max.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" })} · click bar for phase · click strip for full schedule`}
      onClick={(e) => {
        // Fires when user clicks outside any phase bar (e.g. the gap
        // between phases). Bars stop propagation so this doesn't
        // double-fire.
        if (onTimelineClick) { e.stopPropagation(); onTimelineClick(); }
      }}
    >
      {phases.map((p) => {
        const leftPct  = ((p.start - min) / total) * 100;
        const widthPct = Math.max(2, ((p.end - p.start) / total) * 100);
        const color = TIMELINE_PHASE_COLOR[p.key] || "var(--text-muted)";
        const isClickable = !!onPhaseClick;
        return (
          <div
            key={p.key}
            title={`${p.key}: ${p.start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} → ${p.end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}${isClickable ? " · click to filter schedule to this phase" : ""}`}
            onClick={(e) => {
              if (!isClickable) return;
              e.stopPropagation();
              onPhaseClick(p.key);
            }}
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              background: color,
              opacity: 0.85,
              borderRadius: 2,
              cursor: isClickable ? "pointer" : "default",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { if (isClickable) e.currentTarget.style.opacity = "0.85"; }}
          />
        );
      })}
      {todayInRange && (
        <div style={{
          position: "absolute",
          top: 0, bottom: 0,
          left: Math.max(0, Math.min(width - 1, todayX)),
          width: 1.5,
          background: GANTT_TODAY_HEX,
          boxShadow: "0 0 0 1px rgba(255,107,0,0.35)",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}
