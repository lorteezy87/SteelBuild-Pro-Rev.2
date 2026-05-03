// ── Visual sub-components extracted from ScheduleGantt.jsx ──────────────
//
// These render the bars, diamonds, chips, and ribbons inside the gantt
// rows. They're intentionally stateless — every input arrives via props
// and styling is inline so the file has no CSS dependency. Lifting them
// out drops the main component file by ~300 lines without altering any
// rendered output.
import React from "react";
import {
  DETAILING_STAGE_GATES,
  DETAILING_STAGE_META,
  getStageDates,
  usesStageDates,
  getActiveStage,
} from "@/lib/stageDates";
import {
  PHASE_BY_KEY,
  displayPct,
  isMilestoneTask,
  sanitizeTaskName,
  statusColor,
} from "./scheduleTaskUtils";

// Compact status chip used in the left-panel STATUS column. Replaces a
// plain colored text label with a tinted pill so the four primary states
// (Not Started, In Progress, Complete, Delayed/Overdue) are visually
// distinct at a glance — the audit called the previous text-only render
// "easy to scan but not visually strong".
export function StatusChip({ status, overdue }) {
  // An overdue, not-yet-complete row should read as Delayed regardless of
  // the stored status — that matches how the Gantt bar already marks it.
  const effective = overdue && status !== "Complete" ? "Delayed" : (status || "Not Started");
  const c = statusColor(effective);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 3,
        background: `color-mix(in srgb, ${c} 18%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: c,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {effective}
    </span>
  );
}

// ── Summary gantt bar with % rollup ──────────────────────────────────────
export function SummaryBar({ phase, leftPx, widthPx, pctComplete }) {
  const ph = PHASE_BY_KEY[phase.key];
  const color = ph?.color || "#888";
  const pct = Math.round(pctComplete || 0);
  return (
    <div style={{
      position: "absolute",
      left: leftPx,
      width: Math.max(widthPx, 6),
      height: 14,
      top: "50%",
      transform: "translateY(-50%)",
      background: `${color}40`,
      borderRadius: 2,
      overflow: "hidden",
    }}>
      {/* Progress fill */}
      <div style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        width: `${Math.min(pct, 100)}%`,
        background: color,
        borderRadius: 2,
        transition: "width 0.3s",
      }} />
      {/* End caps */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", background: color, borderRadius: "2px 0 0 2px" }} />
      <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: "100%", background: color, borderRadius: "0 2px 2px 0" }} />
      {/* % label */}
      {widthPx > 40 && (
        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

// ── Milestone diamond ────────────────────────────────────────────────────
export function MilestoneDiamond({ leftPx, task }) {
  const color = task.status === "Complete" ? "#10B981" : "var(--accent)";
  return (
    <div style={{
      position: "absolute",
      left: leftPx - 7,
      top: "50%",
      transform: "translateY(-50%) rotate(45deg)",
      width: 14, height: 14,
      background: color,
      border: `2px solid ${color}`,
      boxShadow: `0 0 6px ${color}40`,
    }} />
  );
}

// ── Task gantt bar ────────────────────────────────────────────────────────
// Detailing stage-gate visualisation. Each gate (OFA / BFA / FFF /
// Released) now carries its own start AND end date, so we render a
// thin coloured ribbon spanning [start, end] for each filled gate plus
// small diamond markers at the start and end. The currently-active
// gate (the one the schedule is "following" for due-date tracking) is
// rendered brighter and slightly thicker so the PM can see at a glance
// which window is live. Returns null for non-Detailing tasks.
export function StageGateMilestones({ task, px }) {
  if (!usesStageDates(task)) return null;
  const dates = getStageDates(task);
  const filled = DETAILING_STAGE_GATES
    .map((gate) => ({ gate, ...dates[gate] }))
    .filter((g) => g.start || g.end);
  if (filled.length === 0) return null;

  const activeGate = getActiveStage(dates);

  return (
    <>
      {filled.map(({ gate, start, end }) => {
        const meta = DETAILING_STAGE_META[gate] || {};
        const isActive = gate === activeGate;
        // A gate may have only one of {start, end} during data entry —
        // in that case we still drop a single diamond at the filled
        // date so the PM can see what's been entered, but no ribbon.
        const ribbonFrom = start || end;
        const ribbonTo   = end   || start;
        const ribbonLeft  = px(ribbonFrom);
        const ribbonRight = px(ribbonTo);
        const ribbonWidth = Math.max(0, ribbonRight - ribbonLeft);
        const tooltip = `${meta.label} — ${meta.caption || gate}` +
          (start ? ` · start ${start}` : '') +
          (end   ? ` · end ${end}`     : '') +
          (isActive ? ' · active' : '');
        return (
          <React.Fragment key={gate}>
            {start && end && ribbonWidth > 0 && (
              <div
                title={tooltip}
                style={{
                  position: "absolute",
                  left: ribbonLeft,
                  width: ribbonWidth,
                  // Sit just below the main bar so the segment doesn't
                  // hide the % complete fill. Shift up a few px and
                  // make the active gate a touch taller.
                  top: isActive ? "calc(50% + 11px)" : "calc(50% + 13px)",
                  height: isActive ? 5 : 3,
                  background: meta.color || "var(--accent)",
                  opacity: isActive ? 1 : 0.7,
                  borderRadius: 2,
                  pointerEvents: "auto",
                  zIndex: 2,
                }}
              />
            )}
            {start && (
              <GateDiamond
                kind="start"
                left={px(start)}
                color={meta.color}
                active={isActive}
                title={tooltip}
              />
            )}
            {end && (
              <GateDiamond
                kind="end"
                left={px(end)}
                color={meta.color}
                active={isActive}
                title={tooltip}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// Small diamond marker for a gate's start or end. End markers are
// solid; start markers are outlined so the user can tell them apart
// when both fall on the same row.
export function GateDiamond({ left, color, active, kind, title }) {
  const size = active ? 11 : 9;
  return (
    <div
      title={title}
      style={{
        position: "absolute",
        left: left - size / 2,
        top: "50%",
        transform: "translateY(-50%) rotate(45deg)",
        width: size,
        height: size,
        background: kind === "end" ? (color || "var(--accent)") : "transparent",
        border: `1.5px solid ${color || "var(--accent)"}`,
        outline: "1.5px solid #0F1118",
        borderRadius: 2,
        boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.30)" : "0 0 0 1px rgba(255,255,255,0.12)",
        pointerEvents: "auto",
        cursor: "default",
        zIndex: 3,
      }}
    />
  );
}

export function TaskBar({ task, leftPx, widthPx }) {
  const pct = displayPct(task);
  const name = sanitizeTaskName(task);

  if (isMilestoneTask(task)) {
    return <MilestoneDiamond leftPx={leftPx} task={task} />;
  }

  if (task.status === "Complete") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", background: "#10B981", borderRadius: 2, overflow: "hidden", display: "flex", alignItems: "center", padding: "0 8px" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#003915", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
    );
  }
  if (task.status === "In Progress") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px solid var(--accent)", borderRadius: 2, overflow: "hidden", background: "rgba(200,155,32,0.08)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden" }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: "#000", whiteSpace: "nowrap" }}>{name}</span>
        </div>
      </div>
    );
  }
  if (task.status === "Delayed") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px dashed #EF4444", borderRadius: 2, background: "rgba(239,68,68,0.06)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#EF4444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
    );
  }
  // Not Started / default
  return (
    <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1px solid var(--border-strong)", borderRadius: 2, background: "var(--hover-bg)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
      <span style={{ fontSize: 8, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
    </div>
  );
}

// ── Submittal bar ─────────────────────────────────────────────────────────
export function SubmittalBar({ submittal, leftPx, widthPx }) {
  const statusColors = {
    "Approved":             { bg: "rgba(16,185,129,0.15)", border: "#10B981", text: "#10B981" },
    "Approved as Noted":    { bg: "rgba(16,185,129,0.10)", border: "#10B981", text: "#10B981" },
    "Rejected":             { bg: "rgba(239,68,68,0.12)",  border: "#EF4444", text: "#EF4444" },
    "Revise & Resubmit":    { bg: "rgba(239,68,68,0.10)",  border: "#EF4444", text: "#EF4444" },
    "Under Review":         { bg: "rgba(59,130,246,0.12)", border: "#3B82F6", text: "#3B82F6" },
    "Draft":                { bg: "rgba(100,116,139,0.10)", border: "#64748B", text: "#94A3B8" },
  };
  const c = statusColors[submittal.status] || statusColors["Draft"];
  const isLate = submittal.due_date && new Date(submittal.due_date) < new Date() && submittal.status !== "Approved" && submittal.status !== "Approved as Noted";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 18,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px dashed ${isLate ? "#EF4444" : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`📂 ${submittal.display_name || submittal.file_name}${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>📂</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? "#EF4444" : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {submittal.display_name || submittal.file_name}
      </span>
    </div>
  );
}

// ── Delivery bar ─────────────────────────────────────────────────────────
export function DeliveryBar({ delivery, leftPx, widthPx }) {
  const statusColors = {
    "Scheduled":   { bg: "rgba(245,158,11,0.15)", border: "#F59E0B", text: "#F59E0B" },
    "In Transit":  { bg: "rgba(59,130,246,0.15)", border: "#3B82F6", text: "#3B82F6" },
    "Delivered":   { bg: "rgba(16,185,129,0.15)", border: "#10B981", text: "#10B981" },
    "Partial":     { bg: "rgba(239,68,68,0.12)",  border: "#EF4444", text: "#EF4444" },
    "Rejected":    { bg: "rgba(239,68,68,0.15)",  border: "#EF4444", text: "#EF4444" },
    "Delayed":     { bg: "rgba(220,38,38,0.12)", border: "#DC2626", text: "#DC2626" },
  };
  const c = statusColors[delivery.status] || statusColors["Scheduled"];
  const isLate = delivery.scheduled_date && new Date(delivery.scheduled_date) < new Date() && delivery.status !== "Delivered";
  const label = delivery.description || delivery.vendor || "Delivery";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 20), height: 20,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px solid ${isLate ? "#EF4444" : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`🚛 ${label} · ${delivery.vendor || "—"} · ${delivery.pieces || 0}pc ${delivery.weight_tons || 0}T${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>🚛</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? "#EF4444" : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </div>
  );
}
