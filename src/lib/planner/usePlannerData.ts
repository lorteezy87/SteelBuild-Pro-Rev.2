/**
 * usePlannerData.ts — read-only data layer for the Personal Planner (P1).
 *
 * "My open work across every project I'm a member of." RLS already scopes
 * action_items/meetings to the caller's projects, so the planner just adds an
 * `assigned_user_id = me` filter on top — no cross-project leak.
 *
 * P1 is read-only; status/duration write-back lands in P2. Queries are
 * defensive: if the planner migration hasn't been applied yet (the
 * assigned_user_id / estimated_hours / subtasks columns don't exist), the
 * filter throws — we swallow it and return empty so the page shows a clean
 * empty state instead of crashing.
 */

import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  mapRowToPlannerTask,
  mapRowToPlannerMeeting,
  type ActionItemRow,
  type MeetingRow,
} from "./mappers";
import {
  DEFAULT_WORK_SETTINGS,
  type PlannerTask,
  type PlannerMeeting,
  type WorkSettings,
} from "./autoSchedule";

const STALE_TIME = 30_000;

function warnOnce(scope: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[planner] ${scope} query failed (planner migration applied?):`, err);
}

/** My open action items across every project I'm a member of. */
export function useMyTasks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery<PlannerTask[]>({
    queryKey: ["planner", "tasks", userId],
    enabled: !!userId,
    staleTime: STALE_TIME,
    queryFn: async () => {
      try {
        const rows = (await entities.ActionItem.filter(
          { assigned_user_id: userId },
          "-due_date",
        )) as unknown as ActionItemRow[];
        return (rows ?? []).map(mapRowToPlannerTask);
      } catch (err) {
        warnOnce("tasks", err);
        return [];
      }
    },
  });
}

/** My meetings that carry a real time block (the only ones the scheduler uses). */
export function useMyMeetings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery<PlannerMeeting[]>({
    queryKey: ["planner", "meetings", userId],
    enabled: !!userId,
    staleTime: STALE_TIME,
    queryFn: async () => {
      try {
        const rows = (await entities.Meeting.filter({
          assigned_user_id: userId,
        })) as unknown as MeetingRow[];
        return (rows ?? [])
          .map(mapRowToPlannerMeeting)
          .filter((m): m is PlannerMeeting => m !== null);
      } catch (err) {
        warnOnce("meetings", err);
        return [];
      }
    },
  });
}

/** Coerce a stored planner-prefs blob into a valid WorkSettings, else default. */
export function resolveWorkSettings(raw: unknown): WorkSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_WORK_SETTINGS;
  const r = raw as Record<string, unknown>;
  const workStart = Number(r.workStart);
  const workEnd = Number(r.workEnd);
  const workdays = Array.isArray(r.workdays)
    ? r.workdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  return {
    workStart: Number.isFinite(workStart) ? workStart : DEFAULT_WORK_SETTINGS.workStart,
    workEnd: Number.isFinite(workEnd) ? workEnd : DEFAULT_WORK_SETTINGS.workEnd,
    workdays: workdays.length ? workdays : DEFAULT_WORK_SETTINGS.workdays,
  };
}

/** My work-hour preferences from user_profiles.metadata.planner (with default). */
export function useWorkSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery<WorkSettings>({
    queryKey: ["planner", "work-settings", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const rows = (await entities.User.filter({ id: userId }, undefined, 1)) as unknown as Array<{
          metadata?: { planner?: unknown } | null;
        }>;
        return resolveWorkSettings(rows?.[0]?.metadata?.planner);
      } catch (err) {
        warnOnce("work-settings", err);
        return DEFAULT_WORK_SETTINGS;
      }
    },
  });
}
