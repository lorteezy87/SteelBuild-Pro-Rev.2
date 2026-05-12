// ── Visual sub-components extracted from ScheduleGantt.jsx ──────────────
//
// These render the bars, diamonds, chips, and ribbons inside the gantt
// rows. They're intentionally stateless — every input arrives via props
// and styling is inline so the file has no CSS dependency. Lifting them
// out drops the main component file by ~300 lines without altering any
// rendered output.
import React from "react";
import { GANTT_PHASE_HEX, GANTT_STATUS_HEX } from "@/lib/ganttTheme";
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
// Gantter-AI-style summary ribbon: a translucent track with a glossy
// progress fill, larger rounded corners, and a subtle inset highlight
// that gives the bar a soft "lozenge" feel. End caps are baked into the
// rounded background so there's nothing for the eye to catch as a seam.
// Position math (leftPx, widthPx, top:50%) is unchanged so the bar lines
// up exactly where the date math says it should.
export function SummaryBar({ phase, leftPx, widthPx, pctComplete }) {
  const ph = PHASE_BY_KEY[phase.key];
  const color = ph?.color || "#888";
  const pct = Math.round(pctComplete || 0);
  const w = Math.max(widthPx, 6);
  return (
    <div style={{
      position: "absolute",
      left: leftPx,
      width: w,
      height: 12,
      top: "50%",
      transform: "translateY(-50%)",
      background: `color-mix(in srgb, ${color} 22%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
      borderRadius: 5,
      overflow: "hidden",
      boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(0,0,0,0.18)`,
    }}>
      {/* Progress fill — vertical gradient gives the bar a glossy
          highlight without a separate overlay layer. */}
      <div style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 92%, white) 0%, ${color} 60%, color-mix(in srgb, ${color} 88%, black) 100%)`,
        borderRadius: 4,
        transition: "width 0.3s",
      }} />
      {/* % label — only render when the bar is wide enough. */}
      {w > 44 && (
        <span className="sbd-num" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)", textShadow: "0 1px 1px rgba(0,0,0,0.45)", letterSpacing: "0.03em" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

// ── Milestone diamond ────────────────────────────────────────────────────
// Solid diamond marker — slightly tightened (12px instead of 14) so it
// reads as a precise milestone pin against the bar grid. Triple-layer
// box-shadow gives a 1.5px page-color isolation ring + a soft accent
// halo so the diamond pops against any underlying summary band.
export function MilestoneDiamond({ leftPx, task }) {
  const color = task.status === "Complete" ? GANTT_STATUS_HEX.complete : GANTT_STATUS_HEX.inProgress;
  return (
    <div style={{
      position: "absolute",
      left: leftPx - 6,
      top: "50%",
      transform: "translateY(-50%) rotate(45deg)",
      width: 12, height: 12,
      background: color,
      borderRadius: 1.5,
      boxShadow: `0 0 0 1.5px var(--bg-page), 0 0 0 2.5px color-mix(in srgb, ${color} 55%, transparent), 0 0 8px ${color}55`,
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

// Decide where the task name sits relative to the bar. Inside when
// there's enough horizontal room (≥ ~6 chars worth), otherwise the
// label renders absolutely-positioned past the right edge so a short
// bar (e.g. a 1-day task at week zoom) still shows what it represents.
// The outside label uses position:absolute against the bar shell, so
// it never widens the shell's bounding box (which would shift any
// dependency arrow targeting this task).
function resolveLabelPlacement(name, widthPx) {
  const required = Math.max(36, (name?.length || 0) * 5.5 + 16);
  return widthPx >= required ? "inside" : "outside";
}

// Shared geometry so every status variant of TaskBar lays out
// identically — anything position-sensitive (left, width, vertical
// centring) stays untouched. Visual variants only swap colors / fills
// inside this fixed shell.
const BAR_HEIGHT = 18;
const BAR_RADIUS = 4;

// Task name rendered either inside the bar (white over the colored
// fill, with a subtle text shadow on busy backgrounds) or as a
// secondary-text label clipped to the right of the bar.
function BarLabel({ name, placement, status }) {
  if (placement === "inside") {
    return (
      <span style={{
        position: "relative",
        zIndex: 2,
        fontSize: 9,
        fontWeight: 700,
        color: status === "Complete" ? "#003915" : status === "Delayed" ? "#fff" : "#0F1118",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        padding: "0 8px",
        textShadow: status === "Delayed" ? "0 1px 1px rgba(0,0,0,0.4)" : undefined,
      }}>{name}</span>
    );
  }
  return (
    <span style={{
      position: "absolute",
      left: "100%",
      top: "50%",
      transform: "translateY(-50%)",
      marginLeft: 6,
      fontSize: 10,
      fontWeight: 500,
      color: status === "Delayed" ? GANTT_STATUS_HEX.delayed : "var(--text-secondary)",
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      fontFamily: "var(--font-body)",
    }}>{name}</span>
  );
}

export function TaskBar({ task, leftPx, widthPx }) {
  const pct = displayPct(task);
  const name = sanitizeTaskName(task);

  if (isMilestoneTask(task)) {
    return <MilestoneDiamond leftPx={leftPx} task={task} />;
  }

  const w = Math.max(widthPx, 4);
  const placement = resolveLabelPlacement(name, w);

  // Common shell — preserves leftPx/widthPx/top math from the original
  // bar so dependency arrows and date alignment don't shift. Overflow
  // is visible at shell level (so an outside label can paint past the
  // right edge); the colored fill inside has its own overflow:hidden
  // for clean rounded corners.
  const shellStyle = {
    position: "absolute",
    left: leftPx,
    width: w,
    height: BAR_HEIGHT,
    top: "50%",
    transform: "translateY(-50%)",
    overflow: "visible",
    display: "flex",
    alignItems: "center",
  };

  if (task.status === "Complete") {
    const c = GANTT_STATUS_HEX.complete;
    return (
      <div style={shellStyle}>
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(180deg, color-mix(in srgb, ${c} 92%, white) 0%, ${c} 55%, color-mix(in srgb, ${c} 86%, black) 100%)`,
          borderRadius: BAR_RADIUS,
          boxShadow: `0 1px 0 rgba(255,255,255,0.10) inset, 0 0 0 1px rgba(0,0,0,0.22)`,
          overflow: "hidden",
        }} />
        <BarLabel name={name} placement={placement} status="Complete" />
      </div>
    );
  }

  if (task.status === "In Progress") {
    return (
      <div style={shellStyle}>
        {/* Track + progress fill. The track has a subtle accent border
            and a faint accent-tinted background; the fill paints a
            glossy gradient over [0..pct]% of the track. */}
        <div style={{
          position: "absolute", inset: 0,
          background: `${GANTT_STATUS_HEX.inProgress}18`,
          border: `1px solid ${GANTT_STATUS_HEX.inProgress}80`,
          borderRadius: BAR_RADIUS,
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: `linear-gradient(180deg, color-mix(in srgb, ${GANTT_STATUS_HEX.inProgress} 92%, white) 0%, ${GANTT_STATUS_HEX.inProgress} 55%, color-mix(in srgb, ${GANTT_STATUS_HEX.inProgress} 86%, black) 100%)`,
            transition: "width 0.3s",
          }} />
        </div>
        <BarLabel name={name} placement={placement} status="In Progress" />
      </div>
    );
  }

  if (task.status === "Delayed") {
    const c = GANTT_STATUS_HEX.delayed;
    return (
      <div style={shellStyle}>
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(239,68,68,0.18)",
          border: `1.5px dashed ${c}`,
          borderRadius: BAR_RADIUS,
          overflow: "hidden",
        }} />
        <BarLabel name={name} placement={placement} status="Delayed" />
      </div>
    );
  }

  // Not Started / default — outlined bar over a faint surface tint.
  return (
    <div style={shellStyle}>
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--hover-bg)",
        border: "1px solid var(--border-strong)",
        borderRadius: BAR_RADIUS,
        overflow: "hidden",
      }} />
      {placement === "inside" ? (
        <span style={{
          position: "relative",
          zIndex: 2,
          fontSize: 9,
          fontWeight: 600,
          color: "var(--text-muted)",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          padding: "0 8px",
        }}>{name}</span>
      ) : (
        <BarLabel name={name} placement="outside" status="Not Started" />
      )}
    </div>
  );
}

// ── Submittal bar ─────────────────────────────────────────────────────────
export function SubmittalBar({ submittal, leftPx, widthPx }) {
  const statusColors = {
    "Approved":             { bg: `${GANTT_STATUS_HEX.complete}26`, border: GANTT_STATUS_HEX.complete, text: GANTT_STATUS_HEX.complete },
    "Approved as Noted":    { bg: `${GANTT_STATUS_HEX.complete}1A`, border: GANTT_STATUS_HEX.complete, text: GANTT_STATUS_HEX.complete },
    "Rejected":             { bg: `${GANTT_STATUS_HEX.delayed}1F`,  border: GANTT_STATUS_HEX.delayed, text: GANTT_STATUS_HEX.delayed },
    "Revise & Resubmit":    { bg: `${GANTT_STATUS_HEX.delayed}1A`,  border: GANTT_STATUS_HEX.delayed, text: GANTT_STATUS_HEX.delayed },
    "Under Review":         { bg: `${GANTT_STATUS_HEX.inProgress}1F`, border: GANTT_STATUS_HEX.inProgress, text: GANTT_STATUS_HEX.inProgress },
    "Draft":                { bg: "rgba(100,116,139,0.10)", border: "#64748B", text: "#94A3B8" },
  };
  const c = statusColors[submittal.status] || statusColors["Draft"];
  const isLate = submittal.due_date && new Date(submittal.due_date) < new Date() && submittal.status !== "Approved" && submittal.status !== "Approved as Noted";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 18,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px dashed ${isLate ? GANTT_STATUS_HEX.delayed : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`📂 ${submittal.display_name || submittal.file_name}${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>📂</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? GANTT_STATUS_HEX.delayed : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {submittal.display_name || submittal.file_name}
      </span>
    </div>
  );
}

// ── Delivery bar ─────────────────────────────────────────────────────────
export function DeliveryBar({ delivery, leftPx, widthPx }) {
  const statusColors = {
    "Scheduled":   { bg: `${GANTT_PHASE_HEX.Delivery}26`, border: GANTT_PHASE_HEX.Delivery, text: GANTT_PHASE_HEX.Delivery },
    "In Transit":  { bg: `${GANTT_STATUS_HEX.inProgress}26`, border: GANTT_STATUS_HEX.inProgress, text: GANTT_STATUS_HEX.inProgress },
    "Delivered":   { bg: `${GANTT_STATUS_HEX.complete}26`, border: GANTT_STATUS_HEX.complete, text: GANTT_STATUS_HEX.complete },
    "Partial":     { bg: `${GANTT_STATUS_HEX.delayed}1F`,  border: GANTT_STATUS_HEX.delayed, text: GANTT_STATUS_HEX.delayed },
    "Rejected":    { bg: `${GANTT_STATUS_HEX.delayed}26`,  border: GANTT_STATUS_HEX.delayed, text: GANTT_STATUS_HEX.delayed },
    "Delayed":     { bg: `${GANTT_STATUS_HEX.delayed}1F`, border: GANTT_STATUS_HEX.delayed, text: GANTT_STATUS_HEX.delayed },
  };
  const c = statusColors[delivery.status] || statusColors["Scheduled"];
  const isLate = delivery.scheduled_date && new Date(delivery.scheduled_date) < new Date() && delivery.status !== "Delivered";
  const label = delivery.description || delivery.vendor || "Delivery";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 20), height: 20,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px solid ${isLate ? GANTT_STATUS_HEX.delayed : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`🚛 ${label} · ${delivery.vendor || "—"} · ${delivery.pieces || 0}pc ${delivery.weight_tons || 0}T${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>🚛</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? GANTT_STATUS_HEX.delayed : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </div>
  );
}
