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
import { nextSearchParamsPatch } from "./hubs/hubTabHelpers";
import { useQuery } from "@tanstack/react-query";

import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useUserPrefs } from "@/hooks/useUserPrefs";

import { toIsoDate } from "@/lib/calendarMath";
import {
  buildCalendarEvents,
  EVENT_TYPE_GROUPS,
} from "@/lib/calendarEvents";

import {
  loadFilters,
  saveFilters,
  defaultFilters,
  parseInitialView,
  parseInitialFocus,
  filterCalendarEvents,
  computeVisibleRange,
  computeHeaderLabel,
  shiftFocus,
  exportCalendarIcs,
  todayLocal,
} from "./projectCalendar/projectCalendarHelpers";
import {
  NoProjectCalendarState,
  CalendarToolbar,
  CalendarFilterChips,
  CalendarBody,
  ProjectCalendarShell,
} from "./projectCalendar/ProjectCalendarUi";

import "@/styles/calendarPrint.css";

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
  const [view, setView] = useState(() => parseInitialView(searchParams.get("view")));

  // ── Focus date (the day/week/month we're looking at) ──────────────
  const [focus, setFocus] = useState(() => parseInitialFocus(searchParams.get("date")));

  // Sync state → URL (so deep-links / reloads persist).
  useEffect(() => {
    setSearchParams(
      nextSearchParamsPatch(searchParams, {
        view,
        date: toIsoDate(focus),
      }),
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focus]);

  // ── Filter chips ──────────────────────────────────────────────────
  const [filters, setFilters] = useState(() => {
    const stored = loadFilters();
    if (stored) return stored;
    return defaultFilters(EVENT_TYPE_GROUPS);
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
    () => filterCalendarEvents(allEvents, filters),
    [allEvents, filters],
  );

  // ── Visible-range computation (for ICS export scope) ──────────────
  const visibleRange = useMemo(
    () => computeVisibleRange(view, focus, weekStart),
    [view, focus, weekStart],
  );

  // ── Header label + nav handlers ───────────────────────────────────
  const headerLabel = useMemo(
    () => computeHeaderLabel(view, focus, weekStart),
    [view, focus, weekStart],
  );

  const goPrev = () => setFocus((d) => shiftFocus(view, d, -1));
  const goNext = () => setFocus((d) => shiftFocus(view, d, 1));
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
    exportCalendarIcs({
      scheduleTasks,
      deliveries,
      rfis,
      submittals,
      changeOrders,
      actionItems,
      inspections,
      dailyLogs,
      projectNumber: activeProject?.project_number || "",
      projectName: activeProject?.name,
      visibleRange,
    });
  };

  // ── No-project early exit (after all hooks, never before) ─────────
  if (!projectId) {
    return <NoProjectCalendarState />;
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <ProjectCalendarShell
      drawerDay={drawerDay}
      events={events}
      onCloseDrawer={() => setDrawerDay(null)}
      onEventClick={handleEventClick}
      onJumpToDay={handleJumpToDay}
    >
      <CalendarToolbar
        projectNumber={activeProject?.project_number}
        headerLabel={headerLabel}
        eventCount={events.length}
        onPrev={goPrev}
        onToday={goToday}
        onNext={goNext}
        view={view}
        onViewChange={setView}
        onPrint={handlePrint}
        onExportIcs={handleExportIcs}
      />

      <CalendarFilterChips
        filters={filters}
        allEvents={allEvents}
        onToggle={toggleFilter}
        onReset={() => setFilters(defaultFilters(EVENT_TYPE_GROUPS))}
      />

      <CalendarBody
        view={view}
        focus={focus}
        today={todayLocal()}
        events={events}
        weekStart={weekStart}
        onDayClick={handleDayClick}
        onEventClick={handleEventClick}
      />
    </ProjectCalendarShell>
  );
}
