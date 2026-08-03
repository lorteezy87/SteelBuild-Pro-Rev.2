import { createElement, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectContext } from "@/components/shared/ProjectContext";
import { useOrg } from "@/components/shared/OrgContext";
import { useAuth } from "@/lib/AuthContext";
import type { PlannerAction, PlannerScheduleTask } from "@planner/data/plannerTypes";
import { usePlannerOffline } from "@planner/offline/PlannerOfflineProvider";

type PlannerScopedProject = {
  id: string;
  org_id?: string | null;
  is_deleted?: boolean;
  on_hold?: boolean;
};

type PlannerOrganization = {
  id: string;
  metadata?: unknown;
};

type ProjectContextValue = {
  projects: PlannerScopedProject[];
  loading: boolean;
  projectLoadError: string | null;
};

export type PlannerQueueData = {
  actions: PlannerAction[];
  scheduleTasks: PlannerScheduleTask[];
  currentUserIdentityTokens: string[];
  todayIso: string;
  projectCount: number;
  isLoading: boolean;
  isReady: boolean;
  errorMessage: string | null;
  unavailableMessage: string | null;
};

export const PLANNER_FALLBACK_TIMEZONE = "America/Phoenix";

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getPlannerTimeZone(metadata: unknown): string {
  const timezone = typeof metadata === "object" && metadata !== null && "timezone" in metadata
    ? (metadata as { timezone?: unknown }).timezone
    : null;
  return typeof timezone === "string" && isValidTimeZone(timezone) ? timezone : PLANNER_FALLBACK_TIMEZONE;
}

export function getPlannerTodayIsoForTimeZone(now: Date, timeZone: string): string {
  const resolvedTimeZone = isValidTimeZone(timeZone) ? timeZone : PLANNER_FALLBACK_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const valueFor = (kind: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === kind)?.value ?? "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

export function getPlannerTodayIso(metadata: unknown, now = new Date()): string {
  return getPlannerTodayIsoForTimeZone(now, getPlannerTimeZone(metadata));
}

/** Shared org-local Planner clock. Planner routes mount independently, so one active route owns one timer. */
export function usePlannerTodayIso(orgMetadata: unknown): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = globalThis.setInterval(() => setNow(new Date()), 60_000);
    return () => globalThis.clearInterval(intervalId);
  }, []);

  return getPlannerTodayIso(orgMetadata, now);
}

export function getPlannerUserIdentityTokens(user: { id?: string | null; email?: string | null; full_name?: string | null } | null | undefined): string[] {
  return [user?.id, user?.email, user?.full_name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function queryErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** Shared RLS-scoped repository fan-out for all Planner queue routes. */
export function usePlannerQueueData(): PlannerQueueData {
  const { projects, loading: isLoadingProjects, projectLoadError } = useContext(ProjectContext) as ProjectContextValue;
  const { currentOrg, isLoadingOrgs } = useOrg() as { currentOrg: PlannerOrganization | null; isLoadingOrgs: boolean };
  const { user } = useAuth();
  const offline = usePlannerOffline();
  const orgId = currentOrg?.id ?? null;
  const todayIso = usePlannerTodayIso(currentOrg?.metadata);
  const projectIds = useMemo(
    () => (orgId ? projects
      .filter((project) => project.org_id === orgId && project.is_deleted !== true && project.on_hold !== true)
      .map((project) => project.id) : []),
    [orgId, projects],
  );
  const queriesEnabled = Boolean(orgId) && !isLoadingProjects && projectIds.length > 0;
  const actionsQuery = useQuery({
    queryKey: ["planner-actions", "core-queues", orgId ?? "", projectIds],
    enabled: queriesEnabled,
    queryFn: async () => {
      if (!offline.online) {
        const snapshots = await Promise.all(projectIds.map((projectId) => offline.loadSnapshot(`actions:${projectId}`)));
        return snapshots.flatMap((snapshot) => (snapshot?.rows ?? []).map((row) => row as unknown as PlannerAction));
      }
      const { listPlannerActions } = await import("@planner/data/actionRepository");
      const groups = await Promise.all(projectIds.map(async (projectId) => {
        const rows = await listPlannerActions(projectId);
        await offline.saveSnapshot(`actions:${projectId}`, rows.map((row) => ({ ...row })));
        return rows;
      }));
      offline.markConnectionVerified();
      return groups.flat();
    },
  });
  const scheduleQuery = useQuery({
    queryKey: ["planner-schedule", "core-queues", orgId ?? "", projectIds],
    enabled: queriesEnabled,
    queryFn: async () => {
      if (!offline.online) {
        const snapshots = await Promise.all(projectIds.map((projectId) => offline.loadSnapshot(`schedule:${projectId}`)));
        return snapshots.flatMap((snapshot) => (snapshot?.rows ?? []).map((row) => row as unknown as PlannerScheduleTask));
      }
      const { listScheduleActivities } = await import("@planner/data/scheduleRepository");
      const groups = await Promise.all(projectIds.map(async (projectId) => {
        const rows = await listScheduleActivities(projectId);
        await offline.saveSnapshot(`schedule:${projectId}`, rows.map((row) => ({ ...row })));
        return rows;
      }));
      offline.markConnectionVerified();
      return groups.flat();
    },
  });
  const errorMessage = projectLoadError
    ?? (actionsQuery.isError ? queryErrorMessage(actionsQuery.error, "Unable to load Planner actions.") : null)
    ?? (scheduleQuery.isError ? queryErrorMessage(scheduleQuery.error, "Unable to load Planner schedule activities.") : null);
  const unavailableMessage = !isLoadingOrgs && !orgId ? "No active SteelBuild workspace is available for Planner." : null;
  const isLoading = isLoadingOrgs || isLoadingProjects || (Boolean(orgId) && projectIds.length > 0 && (actionsQuery.isLoading || scheduleQuery.isLoading));
  const isReady = !isLoading && !errorMessage && !unavailableMessage && (projectIds.length === 0 || (actionsQuery.isSuccess && scheduleQuery.isSuccess));

  return {
    actions: actionsQuery.data ?? [],
    scheduleTasks: scheduleQuery.data ?? [],
    currentUserIdentityTokens: getPlannerUserIdentityTokens(user),
    todayIso,
    projectCount: projectIds.length,
    isLoading,
    isReady,
    errorMessage,
    unavailableMessage,
  };
}

export function PlannerQueueBoundary({
  queue,
  emptyMessage,
  isEmpty,
  children,
}: {
  queue: PlannerQueueData;
  emptyMessage: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (queue.errorMessage) return createElement("p", { role: "alert" }, "Unable to load Planner records: ", queue.errorMessage);
  if (queue.unavailableMessage) return createElement("p", null, queue.unavailableMessage);
  if (queue.isLoading || !queue.isReady) return createElement("p", { role: "status" }, "Loading authorized Planner records…");
  if (isEmpty) return createElement("p", null, emptyMessage);
  return createElement(Fragment, null, children);
}
