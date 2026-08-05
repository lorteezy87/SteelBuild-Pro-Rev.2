/**
 * Presentational UI for Project Calendar.
 */
// @ts-nocheck
import React from "react";
import { ChevronLeft, ChevronRight, Printer, Download } from "lucide-react";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { CommandBar, EmptyState, Button } from "@/components/design-system";
import { EVENT_TYPE_GROUPS } from "@/lib/calendarEvents";
import MonthView from "@/components/calendar/MonthView";
import WeekView from "@/components/calendar/WeekView";
import DayView from "@/components/calendar/DayView";
import DayDetailDrawer from "@/components/calendar/DayDetailDrawer";
import { VIEW_OPTIONS, countEventsByType } from "./projectCalendarHelpers";

export function ViewToggle({ value, onChange }) {
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

export function NoProjectCalendarState() {
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

export function CalendarFilterChips({ filters, allEvents, onToggle, onReset }) {
  return (
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
        const count = countEventsByType(allEvents, g.key);
        return (
          <button
            key={g.key}
            onClick={() => onToggle(g.key)}
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
        onClick={onReset}
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
  );
}

export function CalendarToolbar({
  projectNumber,
  headerLabel,
  eventCount,
  onPrev,
  onToday,
  onNext,
  view,
  onViewChange,
  onPrint,
  onExportIcs,
}) {
  return (
    <div className="calendar-no-print">
      <CommandBar
        eyebrow={`SteelBuild Pro · ${projectNumber || "Project"} · Calendar`}
        title={headerLabel}
        count={eventCount}
        unit=" EVENTS"
        subtitle="Tasks, deliveries, RFIs, submittals, change orders, action items, inspections, and daily logs — one calendar."
      >
        <Button onClick={onPrev} title="Previous">
          <ChevronLeft size={14} strokeWidth={2} />
        </Button>
        <Button onClick={onToday}>Today</Button>
        <Button onClick={onNext} title="Next">
          <ChevronRight size={14} strokeWidth={2} />
        </Button>
        <ViewToggle value={view} onChange={onViewChange} />
        <Button onClick={onPrint} title="Print month view">
          <Printer size={13} strokeWidth={2} /> Print
        </Button>
        <Button onClick={onExportIcs} title="Export .ics for Outlook / Google">
          <Download size={13} strokeWidth={2} /> Export
        </Button>
      </CommandBar>
    </div>
  );
}

export function CalendarBody({
  view,
  focus,
  today,
  events,
  weekStart,
  onDayClick,
  onEventClick,
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {view === "month" && (
        <MonthView
          focus={focus}
          today={today}
          events={events}
          weekStart={weekStart}
          onDayClick={onDayClick}
          onEventClick={onEventClick}
        />
      )}
      {view === "week" && (
        <WeekView
          focus={focus}
          today={today}
          events={events}
          weekStart={weekStart}
          onDayClick={onDayClick}
          onEventClick={onEventClick}
        />
      )}
      {view === "day" && (
        <DayView
          focus={focus}
          events={events}
          onEventClick={onEventClick}
        />
      )}
    </div>
  );
}

export function ProjectCalendarShell({
  children,
  drawerDay,
  events,
  onCloseDrawer,
  onEventClick,
  onJumpToDay,
}) {
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
        {children}
        <DayDetailDrawer
          day={drawerDay}
          events={events}
          onClose={onCloseDrawer}
          onEventClick={onEventClick}
          onJumpToDay={onJumpToDay}
        />
      </div>
    </ErrorBoundary>
  );
}
