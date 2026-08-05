/**
 * Pure event bucketing for Month/Week/Day calendar views.
 */
import {
  toIsoDate,
  fromIsoDate,
  rangesOverlap,
} from "@/lib/calendarMath";
import { EVENT_TYPE_GROUPS } from "@/lib/calendarEvents";

export type CalEvent = {
  start: string;
  end?: string | null;
  type?: string;
  [key: string]: unknown;
};

/** Map each day ISO → events overlapping that day. */
export function bucketEventsByDay<T extends CalEvent>(
  days: Date[],
  events: T[] | null | undefined,
): Map<string, T[]> {
  const list = events || [];
  const map = new Map<string, T[]>();
  for (const d of days) {
    const iso = toIsoDate(d);
    map.set(
      iso,
      list.filter((ev) =>
        rangesOverlap(d, d, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start)),
      ),
    );
  }
  return map;
}

/** Events overlapping a single focus day. */
export function eventsForDay<T extends CalEvent>(
  day: Date | null | undefined,
  events: T[] | null | undefined,
): T[] {
  if (!day) return [];
  return (events || []).filter((ev) =>
    rangesOverlap(day, day, fromIsoDate(ev.start), fromIsoDate(ev.end || ev.start)),
  );
}

/** Group events by EVENT_TYPE_GROUPS keys (empty arrays for unused groups). */
export function groupEventsByType<T extends { type?: string }>(
  events: T[] | null | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  EVENT_TYPE_GROUPS.forEach((g) => map.set(g.key, []));
  for (const ev of events || []) {
    const arr = map.get(ev.type as string) || [];
    arr.push(ev);
    map.set(ev.type as string, arr);
  }
  return map;
}

/** Month grid layout tokens. */
export const MAX_VISIBLE_EVENTS = 3;
export const DAY_HEADERS_SUN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export const DAY_HEADERS_MON = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** Day view collapse threshold for busy groups. */
export const DAY_VIEW_COLLAPSE_AT = 10;

