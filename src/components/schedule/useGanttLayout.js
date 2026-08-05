// ── useGanttLayout — the Gantt's date↔pixel projection ───────────────────
//
// Owns the chart's horizontal geometry: the visible date window (dateRange),
// the week/day pixel scale (WEEK_PX / PX_PER_DAY), total chart width (totalW),
// and the date→pixel helpers (px / spanPx) plus the today marker and
// current-week test. Extracted from ScheduleGantt so the projection math is in
// one place (and unit-testable) instead of woven through the container. Logic is
// byte-identical to the originals.
//
// `effStart`/`effEnd` are passed in (they close over the page's effectiveDates):
// dateRange recomputes only on [allTasks, deliveries, today], capturing the
// current effStart/effEnd — the same behaviour as the inline version.
import { useMemo } from "react";
import {
  buildGanttDateRange,
  ganttWeekPx,
  ganttDayCount,
  ganttTotalWidth,
  ganttDateToPx,
  ganttSpanPx,
  ganttTodayPx,
  ganttNowWeekStart,
} from "./useGanttLayoutHelpers";

export function useGanttLayout({ zoom, today, allTasks, deliveries, effStart, effEnd }) {
  const WEEK_PX = ganttWeekPx(zoom);

  const dateRange = useMemo(
    () =>
      buildGanttDateRange({
        allTasks,
        deliveries,
        today,
        effStart,
        effEnd,
      }),
    [allTasks, deliveries, today],
  );

  const dayCount = ganttDayCount(dateRange);
  const PX_PER_DAY = WEEK_PX / 7;
  const totalW = ganttTotalWidth(dayCount, PX_PER_DAY, dateRange.weeks.length, WEEK_PX);

  const px = (dateStr) => ganttDateToPx(dateStr, dateRange.start, PX_PER_DAY);
  const spanPx = (start, end) => ganttSpanPx(start, end, PX_PER_DAY);

  const todayPx = ganttTodayPx(today, dateRange.start, PX_PER_DAY);
  const showToday = todayPx >= 0 && todayPx <= totalW;

  const nowWeekStart = ganttNowWeekStart(today);
  const isCurrentWeek = (w) => w.toDateString() === nowWeekStart.toDateString();

  return { WEEK_PX, dateRange, dayCount, PX_PER_DAY, totalW, px, spanPx, todayPx, showToday, nowWeekStart, isCurrentWeek };
}
