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
import { Calendar, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SectionCard from "./SectionCard";
import { Sparkline } from "@/components/design-system";
import {
  daysRemaining,
  timelineElapsedPct,
  wpProgressPct,
  wpPipelineRollup,
  overdueWPCount,
  projectMilestones,
  criticalPathTasks,
  fabStatusRollup,
  procurementStatusRollup,
} from "../projectMetrics";
import InlineEditField from "@/components/shared/InlineEditField";

const STAGE_COLOR = {
  "Not Started": "var(--text-muted)",
  "Detailing":   "var(--status-info)",
  "Released":    "var(--status-warning)",
  "Fabrication": "var(--status-review)",
  "Complete":    "var(--status-success-bright)",
  "Shipped":     "#0d9488",
};

export default function ScheduleTimelineSection({
  project,
  wps = [],
  scheduleTasks = [],
  deliveries = [],
  rfis = [],
  actionItems = [],
  onNavigate,
}) {
  const navigate = useNavigate();
  const elapsedPct = useMemo(() => timelineElapsedPct(project), [project]);
  const completePct = useMemo(() => wpProgressPct(wps), [wps]);
  const daysLeft = useMemo(() => daysRemaining(project), [project]);
  const pipeline = useMemo(() => wpPipelineRollup(wps), [wps]);
  const overdue = useMemo(() => overdueWPCount(wps), [wps]);
  const fab = useMemo(() => fabStatusRollup(wps), [wps]);
  // Procurement rollup uses the procurement subset of `deliveries`
  // (anything with a non-null procurement_category). When no rows
  // qualify, the panel renders nothing — same UX as Fab below.
  const proc = useMemo(() => procurementStatusRollup(deliveries), [deliveries]);

  // Milestones come from schedule_tasks tagged task_type='Milestone'.
  // When nothing's tagged yet we synthesise project start + target so
  // the panel always shows something concrete; the synthetic flag lets
  // the UI mark them differently from user-created milestones.
  const milestones = useMemo(
    () => projectMilestones(project, scheduleTasks),
    [project, scheduleTasks],
  );
  // Critical path = schedule_tasks where metadata.is_critical=true.
  // The drawer's "Mark as critical" toggle (added alongside this
  // panel) writes that flag.
  const criticalPath = useMemo(
    () => criticalPathTasks(scheduleTasks),
    [scheduleTasks],
  );

  const start = project?.start_date;
  const target = project?.target_completion_date || project?.forecast_completion_date;

  // Drift is what the user actually cares about — schedule % vs work %.
  // Color the elapsed bar by how badly the project is running behind.
  const drift = elapsedPct - completePct;
  const driftColor =
    drift >= 30 ? "var(--status-error)"
      : drift >= 15 ? "var(--status-warning)"
      : "var(--status-success)";

  // Schedule velocity — task completion per week over last 4 weeks.
  // Gives temporal context to the progress bar above.
  const completionTrend = useMemo(() => {
    const now = new Date();
    const weeks = [0, 1, 2, 3].map((w) => {
      const end = new Date(now);
      end.setDate(end.getDate() - w * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return scheduleTasks.filter((t) => {
        if (t.status !== "Complete") return false;
        const d = new Date(t.updated_at || t.end_date);
        return d >= start && d < end;
      }).length;
    }).reverse();
    return weeks;
  }, [scheduleTasks]);

  const stats = [
    { value: pipeline.total, label: "PACKAGES", color: "accent" },
    { value: milestones.length, label: "MILESTONES", color: "info" },
    { value: overdue, label: "OVERDUE", color: overdue > 0 ? "error" : "muted" },
  ];

  return (
    <SectionCard
      icon={Calendar}
      iconColor="warning"
      title="Schedule & Timeline"
      subtitle="Work packages, milestones, and critical path"
      stats={stats}
    >
      {/* Timeline bar — start and target dates are click-to-edit so
          the PM can set them up from the dashboard without bouncing
          to the Projects page. */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)", marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Start ·</span>
            <InlineEditField
              project={project}
              field="start_date"
              value={start}
              type="date"
              emptyText="Set start"
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em",
              }}
              width="auto"
            />
          </div>
          <span style={{ textAlign: "center" }}>
            Schedule Progress: {elapsedPct}% elapsed
            {Number.isFinite(daysLeft) && daysLeft != null
              ? ` · ${daysLeft} days remaining`
              : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <span>Target ·</span>
            <InlineEditField
              project={project}
              field="target_completion_date"
              value={target}
              type="date"
              emptyText="Set target"
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em",
              }}
              width="auto"
            />
          </div>
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

      {/* Schedule Velocity sparkline — task completions per week, 4wk */}
      {completionTrend.some((v) => v > 0) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "8px 0", marginBottom: 10,
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            VELOCITY · 4WK
          </span>
          <Sparkline data={completionTrend} width={80} height={24} color="var(--status-success)" />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            color: "var(--text-primary)",
          }}>
            {completionTrend[completionTrend.length - 1]} this week
          </span>
        </div>
      )}

      {/* Today / This Week — high-priority upcoming-events strip.
          Quickly answers "what's coming up?" without scrolling the
          dashboard. Click → jump into the Project Calendar focused on
          that day. */}
      <UpcomingEventsStrip
        scheduleTasks={scheduleTasks}
        deliveries={deliveries}
        rfis={rfis}
        actionItems={actionItems}
        onJumpToDay={(iso) => navigate(`/ProjectCalendar?date=${iso}`)}
      />

      {/* Milestones / Critical Path */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 18,
      }}>
        <SubPanel
          title="Key Milestones"
          subtitle={milestones.length > 0
            ? `${milestones.length} tracked`
            : null}
          rightAction={onNavigate ? {
            label: "+ Add",
            title: "Open Schedule with the New Task panel ready (set Type=Milestone)",
            onClick: () => onNavigate("schedule", { create: true }),
          } : null}
        >
          {milestones.length === 0 ? (
            <Empty text="No milestones defined — open Schedule to add one" />
          ) : (
            milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                title={m.title}
                date={m.date}
                synthetic={m.synthetic}
                status={m.status}
                onClick={onNavigate ? () => onNavigate("schedule") : undefined}
              />
            ))
          )}
        </SubPanel>
        <SubPanel
          title="Critical Path"
          subtitle={criticalPath.length > 0
            ? `${criticalPath.length} task${criticalPath.length === 1 ? "" : "s"}`
            : null}
          rightAction={onNavigate ? {
            label: "Manage →",
            title: "Open Schedule and use a task drawer's 'Mark Critical' toggle",
            onClick: () => onNavigate("schedule"),
          } : null}
        >
          {criticalPath.length === 0 ? (
            <Empty text="No critical path tasks — toggle Mark Critical in any task drawer" />
          ) : (
            criticalPath.map((t) => (
              <CriticalRow
                key={t.id}
                title={t.title}
                start={t.start}
                end={t.end}
                status={t.status}
                onClick={onNavigate ? () => onNavigate("schedule") : undefined}
              />
            ))
          )}
        </SubPanel>
      </div>

      {/* WP Pipeline */}
      <div style={{ marginBottom: 14 }}>
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

      {/* Fab Release shop pipeline — surfaces the 7-stage shop floor
          progress so the dashboard tells a continuous story across
          Detailing → Fab → RTS without forcing a click into a
          separate page. Each cell deep-links to /FabRelease pre-
          filtered to that stage. */}
      {fab.total > 0 && (
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>
              Fab Release · Shop Pipeline
              <span style={{ marginLeft: 8, color: "var(--text-muted)", fontWeight: 400 }}>
                {fab.totalTons.toFixed(1)}T total · {fab.shippedTons.toFixed(1)}T shipped
              </span>
            </span>
            {onNavigate && (
              <button
                onClick={() => onNavigate("fab-release")}
                style={LINK_BTN}
              >
                Open Fab Release →
              </button>
            )}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${fab.stages.length}, 1fr)`,
            gap: 4,
          }}>
            {fab.stages.map((stage) => (
              <PipelineCell
                key={stage}
                label={FAB_STAGE_LABEL[stage]}
                count={fab.counts[stage]}
                color={FAB_STAGE_COLOR[stage]}
                onClick={onNavigate ? () => onNavigate("fab-release", { stage }) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Procurement status pipeline — surfaces the 7-stage workflow
          (Identified → Quoted → PO Issued → Confirmed → In Production
          → Shipped → Received). Hidden when the project has no
          procurement-categorized deliveries. Each cell deep-links to
          /Procurement?status=<stage>. */}
      {proc.total > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>
              Procurement Status
              <span style={{ marginLeft: 8, color: "var(--text-muted)", fontWeight: 400 }}>
                {proc.total} item{proc.total === 1 ? "" : "s"}
                {proc.totalWeight > 0 ? ` · ${proc.totalWeight.toFixed(1)}T` : ""}
                {proc.longLead > 0 ? ` · ${proc.longLead} long-lead` : ""}
                {proc.longLeadSlipping > 0
                  ? ` · `
                  : ""}
                {proc.longLeadSlipping > 0 && (
                  <span style={{ color: "var(--status-error)", fontWeight: 700 }}>
                    {proc.longLeadSlipping} slipping
                  </span>
                )}
              </span>
            </span>
            {onNavigate && (
              <button
                onClick={() => onNavigate("procurement")}
                style={LINK_BTN}
              >
                Open Procurement →
              </button>
            )}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${proc.stages.length}, 1fr)`,
            gap: 4,
          }}>
            {proc.stages.map((stage) => (
              <PipelineCell
                key={stage}
                label={PROC_STAGE_LABEL[stage]}
                count={proc.counts[stage]}
                color={PROC_STAGE_COLOR[stage]}
                onClick={onNavigate ? () => onNavigate("procurement", { status: stage }) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

const PROC_STAGE_LABEL = {
  "Identified":    "IDENT",
  "Quoted":        "QUOTED",
  "PO Issued":     "PO",
  "Confirmed":     "CONFIRM",
  "In Production": "IN PROD",
  "Shipped":       "SHIPPED",
  "Received":      "RECEIVED",
};

const PROC_STAGE_COLOR = {
  "Identified":    "var(--text-muted)",
  "Quoted":        "var(--status-info)",
  "PO Issued":     "var(--accent)",
  "Confirmed":     "var(--phase-detailing)",
  "In Production": "var(--status-warning)",
  "Shipped":       "#0d9488",
  "Received":      "var(--status-success)",
};

const FAB_STAGE_LABEL = {
  drawings_approved: "DWG APRVD",
  material_on_hand:  "MATERIAL",
  shop_released:     "RELEASED",
  in_fabrication:    "IN FAB",
  fabricated:        "FABRICATED",
  finish_treatment:  "FINISH",
  ready_to_ship:     "RTS",
};

const FAB_STAGE_COLOR = {
  drawings_approved: "var(--accent)",
  material_on_hand:  "var(--secondary)",
  shop_released:     "var(--status-warning)",
  in_fabrication:    "var(--tertiary)",
  fabricated:        "var(--status-info)",
  finish_treatment:  "#B45309",
  ready_to_ship:     "var(--status-success)",
};

function SubPanel({ title, subtitle, rightAction, children }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 8,
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          {title}
          {subtitle ? (
            <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
              · {subtitle}
            </span>
          ) : null}
        </div>
        {rightAction && (
          <button
            type="button"
            onClick={rightAction.onClick}
            title={rightAction.title || rightAction.label}
            style={{
              background: "none", border: "none", padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {rightAction.label}
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function MilestoneRow({ title, date, synthetic, status, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 8px",
        marginBottom: 4,
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{
        width: 8, height: 8,
        background: synthetic ? "var(--text-muted)" : "var(--accent)",
        transform: "rotate(45deg)",
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontFamily: "var(--font-body)", fontSize: 12,
        color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}{synthetic ? " · derived" : ""}
      </span>
      {status && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          letterSpacing: "0.08em",
          padding: "2px 5px", borderRadius: 3,
          background: "var(--bg-surface-high)",
          color: "var(--text-muted)",
        }}>
          {status}
        </span>
      )}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}>
        {formatShortDate(date)}
      </span>
    </div>
  );
}

function CriticalRow({ title, start, end, status, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 8px",
        marginBottom: 4,
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderLeft: "3px solid var(--status-error)",
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{
        flex: 1,
        fontFamily: "var(--font-body)", fontSize: 12,
        color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}
      </span>
      {status && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          letterSpacing: "0.08em",
          padding: "2px 5px", borderRadius: 3,
          background: "var(--bg-surface-high)",
          color: "var(--text-muted)",
        }}>
          {status}
        </span>
      )}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}>
        {formatShortDate(start)}{end && start !== end ? ` → ${formatShortDate(end)}` : ""}
      </span>
    </div>
  );
}

function formatShortDate(iso) {
  if (!iso || typeof iso !== "string") return "—";
  try {
    const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch { return iso; }
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
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
  cursor: "pointer",
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
  background: "color-mix(in srgb, var(--accent) 6%, transparent)",
  transition: "all 0.15s",
};

// ── Upcoming Events strip ───────────────────────────────────────────
// Surfaces the next 7 days' high-priority events (milestones, RFI
// due dates, deliveries scheduled, action items overdue) in a compact
// horizontal strip. Each item links into the Project Calendar focused
// on that exact day.
function UpcomingEventsStrip({ scheduleTasks = [], deliveries = [], rfis = [], actionItems = [], onJumpToDay }) {
  const items = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
    const inHorizon = (iso) => {
      if (!iso) return false;
      const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
      if (isNaN(d)) return false;
      return d >= today && d <= horizon;
    };
    const isOverdue = (iso) => {
      if (!iso) return false;
      const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
      return !isNaN(d) && d < today;
    };
    const out = [];
    // Milestones in the next 7 days
    for (const t of scheduleTasks) {
      if (t.task_type !== "Milestone" && t.is_milestone !== true) continue;
      const iso = String(t.start_date || t.end_date || "").slice(0, 10);
      if (!inHorizon(iso)) continue;
      out.push({ key: `m-${t.id}`, type: "milestone", date: iso, title: t.task_name, color: "var(--status-warning)" });
    }
    // RFIs due (or overdue) in the window.
    // Answered / Closed RFIs are NOT overdue even if the due date is past
    // — matches the canonical isOverdue() in rfis/utils.js.
    const RFI_CLOSED = new Set(["Answered", "Closed"]);
    for (const r of rfis) {
      if (r.is_deleted) continue;
      const rfiStatus = r.status || "";
      const iso = String(r.date_required || r.due_date || "").slice(0, 10);
      if (!iso) continue;
      const past = isOverdue(iso);
      // Skip closed/answered RFIs entirely when their date is past —
      // they're resolved, not overdue.
      if (past && RFI_CLOSED.has(rfiStatus)) continue;
      if (!inHorizon(iso) && !past) continue;
      out.push({
        key: `r-${r.id}`,
        type: "rfi",
        date: iso,
        title: `${r.rfi_number || "RFI"} due`,
        color: past ? "var(--status-error)" : "var(--status-warning)",
        overdue: past,
      });
    }
    // Deliveries scheduled in the window
    for (const d of deliveries) {
      if (d.is_deleted) continue;
      const iso = String(d.scheduled_date || d.required_date || "").slice(0, 10);
      if (!inHorizon(iso)) continue;
      out.push({
        key: `d-${d.id}`,
        type: "delivery",
        date: iso,
        title: d.delivery_title || d.description || `PO ${d.po_number || ""}`,
        color: "#0d9488",
      });
    }
    // Action items overdue OR due within the window
    for (const a of actionItems) {
      const iso = String(a.due_date || "").slice(0, 10);
      if (!iso) continue;
      const status = (a.status || "").toLowerCase();
      if (status === "closed" || status === "done" || status === "complete") continue;
      if (!inHorizon(iso) && !isOverdue(iso)) continue;
      out.push({
        key: `a-${a.id}`,
        type: "action",
        date: iso,
        title: a.title || "Action item",
        color: isOverdue(iso) ? "var(--status-error)" : "var(--status-info)",
        overdue: isOverdue(iso),
      });
    }
    out.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
    return out.slice(0, 12); // cap so the strip stays one row
  }, [scheduleTasks, deliveries, rfis, actionItems]);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        marginBottom: 18,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CalendarDays size={12} strokeWidth={2} color="var(--accent)" />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            Today / Next 7 Days · {items.length}
          </span>
        </div>
        <button
          onClick={() => onJumpToDay && onJumpToDay(new Date().toISOString().slice(0, 10))}
          style={LINK_BTN}
        >
          Open Calendar →
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onJumpToDay && onJumpToDay(it.date)}
            title={it.title}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 9px",
              borderRadius: 4,
              background: `color-mix(in srgb, ${it.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${it.color} 40%, transparent)`,
              borderLeft: `3px solid ${it.color}`,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-primary)",
              maxWidth: 280,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: it.color,
                letterSpacing: "0.06em",
              }}
            >
              {it.overdue ? "OVERDUE" : it.date.slice(5)}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 220,
              }}
            >
              {it.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
