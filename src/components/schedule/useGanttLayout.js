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
import { MIN_YEAR, MAX_YEAR, parseDateUTC } from "./scheduleDateUtils";

export function useGanttLayout({ zoom, today, allTasks, deliveries, effStart, effEnd }) {
  const WEEK_PX = zoom === "month" ? 80 : zoom === "day" ? 420 : 240;

  const dateRange = useMemo(() => {
    if (allTasks.length === 0) {
      // Even with no tasks, build a 4-week window around today
      const s = new Date(today);
      s.setDate(s.getDate() - s.getDay() - 7); // 1 week before
      const e = new Date(today);
      e.setDate(e.getDate() + (6 - e.getDay()) + 21); // 3 weeks after
      const weeks = [];
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
      return { start: s, end: e, weeks };
    }
    const dates = allTasks.flatMap(t => [
      parseDateUTC(effStart(t)),
      parseDateUTC(effEnd(t)),
    ]).filter(Boolean);
    // Include delivery dates so the timeline stretches to cover them
    deliveries.forEach(d => {
      const sd = parseDateUTC(d.scheduled_date); if (sd) dates.push(sd);
      const rd = parseDateUTC(d.required_date);  if (rd) dates.push(rd);
      const ad = parseDateUTC(d.actual_date);    if (ad) dates.push(ad);
    });
    // Always include today in the range so the TODAY line is always visible
    dates.push(today);
    let start = new Date(Math.min(...dates));
    let end   = new Date(Math.max(...dates));
    // Belt-and-suspenders: parseDateUTC already clamps to [1900,2200], but if
    // a rogue date somehow lands here and we ended up with NaN or a wild
    // year, fall back to a today-centred window rather than generating a
    // million weeks and freezing the browser.
    const startYear = start.getUTCFullYear();
    const endYear   = end.getUTCFullYear();
    if (isNaN(start.getTime()) || isNaN(end.getTime()) ||
        startYear < MIN_YEAR || endYear > MAX_YEAR) {
      start = new Date(today); start.setDate(start.getDate() - start.getDay() - 7);
      end   = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()) + 21);
    }
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()) + 7);
    const weeks = [];
    // Hard cap at ~10 years of weeks (520). If someone's data actually
    // legitimately spans more than that, the gantt is the wrong tool.
    const MAX_WEEKS = 520;
    let d = new Date(start);
    while (d <= end && weeks.length < MAX_WEEKS) {
      weeks.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
    if (weeks.length >= MAX_WEEKS) end = new Date(weeks[weeks.length - 1]);
    return { start, end, weeks };
  }, [allTasks, deliveries, today]);

  const dayCount = Math.ceil((dateRange.end - dateRange.start) / 86400000);
  const PX_PER_DAY = WEEK_PX / 7;
  const totalW = Math.max(dayCount * PX_PER_DAY, dateRange.weeks.length * WEEK_PX);

  const px = (dateStr) => {
    const d = parseDateUTC(dateStr);
    if (!d) return 0;
    return Math.max(0, (d - dateRange.start) / 86400000 * PX_PER_DAY);
  };
  const spanPx = (start, end) => {
    const s = parseDateUTC(start);
    const e = parseDateUTC(end);
    if (!s || !e) return 0;
    return Math.max(4, (e - s) / 86400000 * PX_PER_DAY);
  };

  const todayPx = (today - dateRange.start) / 86400000 * PX_PER_DAY;
  const showToday = todayPx >= 0 && todayPx <= totalW;

  const nowWeekStart = new Date(today);
  nowWeekStart.setDate(today.getDate() - today.getDay());
  const isCurrentWeek = (w) => w.toDateString() === nowWeekStart.toDateString();

  return { WEEK_PX, dateRange, dayCount, PX_PER_DAY, totalW, px, spanPx, todayPx, showToday, nowWeekStart, isCurrentWeek };
}
