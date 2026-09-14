/**
 * useProjectCalendar — the project's working calendar, or Mon–Fri.
 *
 * Audit §2.1 / §7.4. A `project_calendars` row is OPTIONAL: a project without
 * one gets DEFAULT_CALENDAR (Mon–Fri, no holidays), so every project gets
 * weekend-aware scheduling without setup and a Saturday shop configures the
 * exception.
 *
 * The fallback also covers the deploy window. Migrations here are pushed by
 * hand, so the code can land before `project_calendars` exists; a failed read
 * returns the default rather than propagating, because a schedule that renders
 * on Mon–Fri assumptions is right for almost every project and a schedule that
 * fails to render is right for none.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { makeCalendar, DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import type { WorkingCalendar, ProjectCalendarRow } from "@/lib/schedule/workingCalendar";

export interface UseProjectCalendarResult {
  calendar: WorkingCalendar;
  /** True once the row (or its absence) is known. */
  isLoaded: boolean;
  /** True when a real row was found, as opposed to falling back to Mon–Fri. */
  isConfigured: boolean;
}

export function useProjectCalendar(
  projectId: string | null | undefined,
): UseProjectCalendarResult {
  const query = useQuery({
    queryKey: ["project-calendar", projectId],
    queryFn: async (): Promise<ProjectCalendarRow | null> => {
      if (!projectId) return null;
      try {
        const rows = await entities.ProjectCalendar.filter({ project_id: projectId }, undefined, 1);
        return ((rows?.[0] as ProjectCalendarRow | undefined) ?? null);
      } catch {
        // Table missing (migration not yet pushed) or unreadable. Mon–Fri is
        // the right answer for almost every project; failing the whole schedule
        // over a calendar lookup is the right answer for none.
        return null;
      }
    },
    enabled: !!projectId,
    // A calendar changes once a quarter at most, and every schedule derivation
    // depends on it — re-fetching on focus would recompute the whole cascade
    // for nothing.
    staleTime: 5 * 60 * 1000,
  });

  const row = query.data ?? null;

  return {
    // Memoised on the row, not rebuilt per render: the calendar object is a
    // dependency of the cascade and the float memo, so a fresh identity each
    // render would recompute both on every keystroke.
    calendar: useMemo(() => makeCalendar(row), [row]),
    isLoaded: !projectId || !query.isLoading,
    isConfigured: !!row,
  };
}

export { DEFAULT_CALENDAR };
