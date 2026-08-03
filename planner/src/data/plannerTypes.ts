export interface PlannerAction {
  id: string;
  project_id: string;
  status: string;
  priority: string | null;
  archived_at: string | null;
  title?: string | null;
  description?: string | null;
  project_name?: string | null;
  workstream?: string | null;
  action_date?: string | null;
  due_date?: string | null;
  follow_up_date?: string | null;
  impact_date?: string | null;
  waiting_on?: string | null;
  assigned_user_id?: string | null;
  assigned_to?: string | null;
}

export interface PlannerActionFilters {
  projectId?: string | null;
  status?: string | null;
  workstream?: string | null;
  ownerId?: string | null;
  waitingOn?: boolean | null;
  priority?: string | null;
  search?: string | null;
}

export interface PlannerScheduleTask {
  id: string;
  project_id: string;
  status: string;
  assigned_to: string | null;
  resource_names?: string | null;
  task_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  priority?: string | null;
  is_milestone?: boolean | null;
  milestone?: boolean | null;
}

export interface PlannerCalendarEvent {
  id: string;
  kind: "action" | "schedule_task";
  title: string;
  start: string;
  end: string;
  projectId: string;
  sourceId: string;
  isMilestone?: boolean;
}

export type PlannerMyDayRow =
  | { kind: "action"; action: PlannerAction }
  | { kind: "schedule_task"; scheduleTask: PlannerScheduleTask };
