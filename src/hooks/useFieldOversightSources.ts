/**
 * useFieldOversightSources — the project-scoped reads the field oversight
 * surfaces share (Site Readiness, Delay Log, Command Center's field gate).
 *
 * Query keys sit under the registry's entity families ("action-items",
 * "change-requests", "schedule-tasks", "deliveries", "daily-logs") so any
 * mutation elsewhere that invalidates those families refreshes these too.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectCalendar } from "@/hooks/useProjectCalendar";
import { getWeatherRiskForProject } from "@/lib/weatherRisk";
import {
  READINESS_CATEGORY, deriveDelays, deriveReadiness,
} from "@/lib/fieldOversight";
import type {
  ActionItemLike, ChangeRequestLike, DailyLogLike, DeliveryLike, ScheduleTaskLike, WeatherRiskLike,
} from "@/lib/fieldOversight";

const STALE = 60_000;
const EMPTY: never[] = [];

export const FIELD_OVERSIGHT_KEYS = {
  readiness: (pid: string | null | undefined) => ["action-items", pid, "site-readiness"] as const,
  delays: (pid: string | null | undefined) => ["change-requests", pid, "delay-log"] as const,
  tasks: (pid: string | null | undefined) => ["schedule-tasks", pid, "field-oversight"] as const,
  deliveries: (pid: string | null | undefined) => ["deliveries", pid, "field-oversight"] as const,
  logs: (pid: string | null | undefined) => ["daily-logs", pid, "field-oversight"] as const,
};

interface ProjectForWeather { id?: string | null; address?: string | null }

interface WeatherProfile { risks?: WeatherRiskLike[] | null }

type Filterable<T> = { filterAll: (c: Record<string, unknown>, sort?: string) => Promise<T[]> };

export function useFieldOversightSources(
  projectId: string | null | undefined,
  project: ProjectForWeather | null,
  include: { readiness?: boolean; delays?: boolean; deliveries?: boolean; logs?: boolean; weather?: boolean } = {},
) {
  const enabled = !!projectId;
  const pid = projectId ?? "";
  const { calendar, isLoaded: calendarLoaded } = useProjectCalendar(projectId);

  const readinessQ = useQuery({
    queryKey: FIELD_OVERSIGHT_KEYS.readiness(projectId),
    queryFn: () => (entities.ActionItem as unknown as Filterable<ActionItemLike>).filterAll({ project_id: pid, category: READINESS_CATEGORY }, "due_date"),
    enabled: enabled && include.readiness !== false,
    staleTime: STALE,
  });
  const delaysQ = useQuery({
    queryKey: FIELD_OVERSIGHT_KEYS.delays(projectId),
    queryFn: () => (entities.ChangeRequest as unknown as Filterable<ChangeRequestLike>).filterAll({ project_id: pid }, "-request_date"),
    enabled: enabled && include.delays !== false,
    staleTime: STALE,
  });
  const tasksQ = useQuery({
    queryKey: FIELD_OVERSIGHT_KEYS.tasks(projectId),
    queryFn: () => (entities.ScheduleTask as unknown as Filterable<ScheduleTaskLike>).filterAll({ project_id: pid }, "start_date"),
    enabled,
    staleTime: STALE,
  });
  const deliveriesQ = useQuery({
    queryKey: FIELD_OVERSIGHT_KEYS.deliveries(projectId),
    queryFn: () => (entities.Delivery as unknown as Filterable<DeliveryLike>).filterAll({ project_id: pid }, "scheduled_date"),
    enabled: enabled && include.deliveries !== false,
    staleTime: STALE,
  });
  const logsQ = useQuery({
    queryKey: FIELD_OVERSIGHT_KEYS.logs(projectId),
    queryFn: () => (entities.DailyLog as unknown as Filterable<DailyLogLike>).filterAll({ project_id: pid }, "-date"),
    enabled: enabled && include.logs !== false,
    staleTime: STALE,
  });
  const weatherQ = useQuery({
    queryKey: ["weather-risk", projectId, project?.address ?? null],
    queryFn: async () => (await getWeatherRiskForProject(project)) as WeatherProfile | null,
    enabled: enabled && include.weather !== false && !!project?.address,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const tasks = tasksQ.data ?? EMPTY;
  const readiness = useMemo(() => deriveReadiness(readinessQ.data ?? EMPTY, tasks), [readinessQ.data, tasks]);
  const delays = useMemo(() => deriveDelays(delaysQ.data ?? EMPTY), [delaysQ.data]);
  // Null means unknown (no address, still loading, or the service failed).
  const weather: WeatherRiskLike[] | null = weatherQ.data?.risks ?? null;

  const required = [
    tasksQ,
    ...(include.readiness !== false ? [readinessQ] : []),
    ...(include.delays !== false ? [delaysQ] : []),
    ...(include.deliveries !== false ? [deliveriesQ] : []),
    ...(include.logs !== false ? [logsQ] : []),
  ];

  return {
    calendar,
    readinessRows: readinessQ.data ?? EMPTY,
    readiness,
    delays,
    tasks,
    deliveries: deliveriesQ.data ?? EMPTY,
    logs: logsQ.data ?? EMPTY,
    weather,
    isLoading: required.some((q) => q.isLoading) || !calendarLoaded,
    isError: required.some((q) => q.isError),
    error: required.find((q) => q.isError)?.error ?? null,
    refetch: () => { required.forEach((q) => { void q.refetch(); }); },
  };
}
