/**
 * useScheduleTasks — project-scoped schedule-task list with realtime refresh.
 *
 * First extraction of the ScheduleTask data layer out of Schedule.jsx as part
 * of moving data access behind hooks (Supabase access stays inside the hook). Covers
 * the read + realtime invalidation; the create/update/delete and bulk
 * mutations remain in Schedule.jsx for now and will move in later increments.
 *
 * @param {string|null|undefined} projectId
 * @returns {{ scheduleTasks: any[], isLoading: boolean }}
 */

import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export function useScheduleTasks(projectId) {
  const query = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () =>
      projectId
        ? entities.ScheduleTask.filter({ project_id: projectId }, "start_date")
        : [],
    enabled: !!projectId,
  });

  // Keep the cached list fresh when other clients mutate schedule tasks.
  useRealtimeInvalidation("schedule_tasks", projectId, [["schedule-tasks", projectId]]);

  return { scheduleTasks: query.data ?? [], isLoading: query.isLoading };
}
