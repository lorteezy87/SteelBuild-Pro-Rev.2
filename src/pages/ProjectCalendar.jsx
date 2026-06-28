/**
 * ProjectCalendar — single-pane-of-glass project calendar.
 *
 * Aggregates dates from across the project (schedule_tasks, deliveries,
 * RFIs, submittals, change_orders, action_items, inspections,
 * daily_logs, plus the project anchors) and renders them on Month /
 * Week / Day views.
 *
 * Project-scoped — same UX as Schedule.jsx when no project is active.
 *
 * Wiring notes:
 *   - Date in URL: ?date=YYYY-MM-DD jumps the calendar to that focus.
 *     Used by the dashboard's upcoming-events strip + day-drawer
 *     "Open Day" button.
 *   - View in URL: ?view=month|week|day persists across reloads.
 *   - Filter chips: each event-type chip can be toggled off; state
 *     lives in localStorage so the user's preferred view sticks.
 *   - Event clicks navigate to the entity's existing list page
 *     (deliberate — we don't rebuild detail drawers; reuse what exists).
 *     For schedule tasks specifically, the existing /Schedule page
 *     handles deep-link to a row; other entities share a similar
 *     pattern.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Printer, Download } from "lucide-react";

import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { CommandBar, EmptyState, Button } from "@/components/design-system";

import {
  today as todayLocal,
  addDays,
  addMonths,
  fromIsoDate,
  toIsoDate,
  formatMonthYear,
  formatWeekRange,
  formatLongDate,
  startOfWeek,
} from "@/lib/calendarMath";
import {
  buildCalendarEvents,
  EVENT_TYPE_GROUPS,
} from "@/lib/calendarEvents";
import {
  downloadIcs,
  scheduleTaskToEvent,
  deliveryToEvent,
  rfiToEvent,
  submittalToEvent,
  changeOrderToEvent,
  actionItemToEvent,
  inspectionToEvent,
  dailyLogToEvent,
} from "@/lib/icsExport";

import MonthView from "@/components/calendar/MonthView";
import WeekView  from "@/components/calendar/WeekView";
import DayView   from "@/components/calendar/DayView";
import DayDetailDrawer from "@/components/calendar/DayDetailDrawer";

import "@/styles/calendarPrint.css";

const FILTER_LS_KEY = "sbp-calendar-filters";

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch { return null; }
}
function saveFilters(filters) {
  try { localStorage.setItem(FILTER_LS_KEY, JSON.stringify(filters)); } catch { /* noop */ }
}

const VIEW_OPTIONS = [
  { key: "month", label: "Month" },
  { key: "week",  label: "Week"  },
  { key: "day",   label: "Day"   },
];

export default function ProjectCalendar() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  // Honour the user's "Week Starts On" pref. Passed into the grid
  // helpers below (and into the row-rendering child views) so a
  // PM who works on Monday-start ISO weeks sees Mon as column 1.
  const { week_start: weekStart } = useUserPrefs();

  // ── View state (persisted via URL) ────────────────────────────────
  const initialView = (() => {
    const v = searchParams.get("view");
    return ["month", "week", "day"].includes(v) ? v : "month";
  })();
  const [view, setView] = useState(initialView);

  // ── Focus date (the day/week/month we're looking at) ──────────────
  const initialFocus = (() => {
    const d = searchParams.get("date");
    const parsed = d ? fromIsoDate(d) : null;
    return parsed || todayLocal();
  })();
  const [focus, setFocus] = useState(initialFocus);

  // Sync state → URL (so deep-links / reloads persist).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    next.set("date", toIsoDate(focus));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focus]);

  // ── Filter chips ──────────────────────────────────────────────────
  const [filters, setFilters] = useState(() => {
    const stored = loadFilters();
    if (stored) return stored;
    // All groups visible by default
    const def = {};
    EVENT_TYPE_GROUPS.forEach((g) => { def[g.key] = true; });
    return def;
  });
  useEffect(() => { saveFilters(filters); }, [filters]);

  const toggleFilter = (key) =>
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Drawer ────────────────────────────────────────────────────────
  const [drawerDay, setDrawerDay] = useState(null);

  // ── Project-scoped data fetches ───────────────────────────────────
  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () => projectId
      ? entities.ScheduleTask.filter({ project_id: projectId }, "start_date")
      : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => projectId ? entities.Delivery.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId ? entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: submittals = [] } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId ? entities.Submittal.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => projectId ? entities.ChangeOrder.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items", projectId],
    queryFn: () => projectId ? entities.ActionItem.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: inspections = [] } = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () => projectId ? entities.Inspection.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: dailyLogs = [] } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () => projectId ? entities.DailyLog.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  // ── Build the events list (filtered) ──────────────────────────────
  const allEvents = useMemo(() => buildCalendarEvents({
    scheduleTasks,
    deliveries,
    rfis,
    submittals,
    changeOrders,
    actionItems,
    inspections,
    dailyLogs,
    project: activeProject,
  }), [
    scheduleTasks, deliveries, rfis, submittals, changeOrders,
    actionItems, inspections, dailyLogs, activeProject,
  ]);

  const events = useMemo(
    () => allEvents.filter((ev) => {
      // project_anchor isn't in the filter list — always show.
      if (ev.type === "project_anchor") return true;
      return filters[ev.type] !== false;
    }),
    [allEvents, filters]
  );

  // ── Visible-range computation (for ICS export scope) ──────────────
  const visibleRange = useMemo(() => {
    if (view === "day") return { start: focus, end: focus };
    if (view === "week") {
      const s = startOfWeek(focus, weekStart);
      return { start: s, end: addDays(s, 6) };
    }
    // month: extend to the full visible 6-week grid
    const gridStart = startOfWeek(new Date(focus.getFullYear(), focus.getMonth(), 1), weekStart);
    return { start: gridStart, end: addDays(gridStart, 41) };
  }, [view, focus, weekStart]);

  // ── Header label + nav handlers ───────────────────────────────────
  const headerLabel = useMemo(() => {
    if (view === "month") return formatMonthYear(focus);
    if (view === "week")  return formatWeekRange(focus, weekStart);
    return formatLongDate(focus);
  }, [view, focus, weekStart]);

  const goPrev = () => {
    if (view === "month") setFocus((d) => addMonths(d, -1));
    else if (view === "week") setFocus((d) => addDays(d, -7));
    else setFocus((d) => addDays(d, -1));
  };
  const goNext = () => {
    if (view === "month") setFocus((d) => addMonths(d, 1));
    else if (view === "week") setFocus((d) => addDays(d, 7));
    else setFocus((d) => addDays(d, 1));
  };
  const goToday = () => setFocus(todayLocal());

  // ── Day click → drawer ────────────────────────────────────────────
  const handleDayClick = (d) => {
    if (view === "day") {
      // Already in day view — just refocus
      setFocus(d);
      return;
    }
    setDrawerDay(d);
  };
  const handleEventClick = (ev) => {
    if (ev.navTo) navigate(ev.navTo);
  };
  const handleJumpToDay = (d) => {
    setView("day");
    setFocus(d);
    setDrawerDay(null);
  };

  // ── Print ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    document.body.classList.add("printing-calendar");
    // Force month view for print — week/day don't paginate as cleanly.
    const prevView = view;
    if (view !== "month") setView("month");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("printing-calendar");
      if (prevView !== "month") setView(prevView);
    }, 80);
  };

  // ── ICS export ────────────────────────────────────────────────────
  const handleExportIcs = () => {
    const projectNumber = activeProject?.project_number || "";
    const inRange = (iso) => {
      const d = fromIsoDate(iso);
      return d && d >= visibleRange.start && d <= addDays(visibleRange.end, 0);
    };
    const icsEvents = [];
    scheduleTasks.forEach((t) => {
      const e = scheduleTaskToEvent(t, projectNumber);
      if (e && (inRange(e.start) || inRange(e.end))) icsEvents.push(e);
    });
    deliveries.forEach((d) => {
      const e = deliveryToEvent(d, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    rfis.forEach((r) => {
      const e = rfiToEvent(r, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    submittals.forEach((s) => {
      const e = submittalToEvent(s, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    changeOrders.forEach((co) => {
      const e = changeOrderToEvent(co, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    actionItems.forEach((a) => {
      const e = actionItemToEvent(a, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    inspections.forEach((i) => {
      const e = inspectionToEvent(i, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    dailyLogs.forEach((l) => {
      const e = dailyLogToEvent(l, projectNumber);
      if (e && inRange(e.start)) icsEvents.push(e);
    });
    const safeNum = projectNumber ? `-${projectNumber}` : "";
    downloadIcs({
      filename: `project${safeNum}-calendar-${toIsoDate(visibleRange.start)}-to-${toIsoDate(visibleRange.end)}.ics`,
      events: icsEvents,
      calendarName: `SteelBuild Pro — ${activeProject?.name || "Project"} Calendar`,
    });
  };

  // ── No-project early exit (after all hooks, never before) ─────────
  if (!projectId) {
    return (
      <ErrorBoundary label="Project Calendar">
        <div className="sb-dashboard-reference-page" style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
          <CommandBar
            eyebrow="SteelBuild Pro · Calendar"
            title="Project Calendar"
            subtitle="Pick a project from the switcher to see its timeline."
          />
          <EmptyState
            icon="schedule"
            title="No project selected"
            body="The Project Calendar aggregates dates from schedule tasks, deliveries, RFIs, submittals, change orders, inspections, and daily logs. Select a project to start."
          />
        </div>
      </ErrorBoundary>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <ErrorBoundary label="Project Calendar">
      <div
        className="sb-dashboard-reference-page calendar-print-root"
        style={{
          padding: "20px 24px 24px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          gap: 14,
        }}
      >
        <div className="calendar-no-print">
          <CommandBar
            eyebrow={`SteelBuild Pro · ${activeProject?.project_number || "Project"} · Calendar`}
            title={headerLabel}
            count={events.length}
            unit=" EVENTS"
            subtitle="Tasks, deliveries, RFIs, submittals, change orders, action items, inspections, and daily logs — one calendar."
          >
            <Button onClick={goPrev} title="Previous">
              <ChevronLeft size={14} strokeWidth={2} />
            </Button>
            <Button onClick={goToday}>Today</Button>
            <Button onClick={goNext} title="Next">
              <ChevronRight size={14} strokeWidth={2} />
            </Button>
            <ViewToggle value={view} onChange={setView} />
            <Button onClick={handlePrint} title="Print month view">
              <Printer size={13} strokeWidth={2} /> Print
            </Button>
            <Button onClick={handleExportIcs} title="Export .ics for Outlook / Google">
              <Download size={13} strokeWidth={2} /> Export
            </Button>
          </CommandBar>
        </div>

        {/* Filter chips */}
        <div
          className="calendar-no-print"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px 10px",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              alignSelf: "center",
              marginRight: 4,
            }}
          >
            FILTERS
          </span>
          {EVENT_TYPE_GROUPS.map((g) => {
            const on = filters[g.key] !== false;
            const count = allEvents.filter((ev) => ev.type === g.key).length;
            return (
              <button
                key={g.key}
                onClick={() => toggleFilter(g.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: 4,
                  border: `1px solid ${on ? `color-mix(in srgb, ${g.color} 50%, transparent)` : "var(--border-default)"}`,
                  background: on
                    ? `color-mix(in srgb, ${g.color} 14%, transparent)`
                    : "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: on ? "var(--text-primary)" : "var(--text-muted)",
                  letterSpacing: "0.02em",
                  transition: "all 120ms",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: g.color,
                    opacity: on ? 1 : 0.4,
                  }}
                />
                {g.label}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => {
              const allOn = {};
              EVENT_TYPE_GROUPS.forEach((g) => { allOn[g.key] = true; });
              setFilters(allOn);
            }}
            style={{
              marginLeft: "auto",
              padding: "5px 10px",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              background: "transparent",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>

        {/* Body — view switch */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {view === "month" && (
            <MonthView
              focus={focus}
              today={todayLocal()}
              events={events}
              weekStart={weekStart}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {view === "week" && (
            <WeekView
              focus={focus}
              today={todayLocal()}
              events={events}
              weekStart={weekStart}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {view === "day" && (
            <DayView
              focus={focus}
              events={events}
              onEventClick={handleEventClick}
            />
          )}
        </div>

        <DayDetailDrawer
          day={drawerDay}
          events={events}
          onClose={() => setDrawerDay(null)}
          onEventClick={handleEventClick}
          onJumpToDay={handleJumpToDay}
        />
      </div>
    </ErrorBoundary>
  );
}

// ── ViewToggle (segmented control) ──────────────────────────────────
function ViewToggle({ value, onChange }) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            style={{
              padding: "6px 14px",
              background: active ? "var(--accent)" : "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: active ? "var(--bg-base)" : "var(--text-secondary)",
              transition: "all 120ms",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
