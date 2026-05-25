export interface ScheduleTask {
  id?: string;
  wbs_code?: string | null;
  phase?: string;
  task_name?: string;
  task_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  duration?: number | string | null;
  status?: string;
  percent_complete?: number;
  milestone?: boolean;
  is_summary?: boolean;
  parent_task_id?: string | null;
  outline_level?: number;
  dependencies?: string | null;
  resource_names?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
  project_id?: string;
  _hasChildren?: boolean;
  _isRolledUpSummary?: boolean;
  _stored_start_date?: string | null;
  _stored_end_date?: string | null;
  _stored_duration?: number | string | null;
  _stored_percent_complete?: number;
  [key: string]: any;
}

export interface SanitizedTaskUpdate {
  id?: string;
  fields: Record<string, any>;
}

export interface MppPredecessor {
  predUid: string | null | undefined;
  linkType: string;
  lagDuration: string;
}

export interface ParsedMppTask {
  uid: string;
  name: string;
  start: string | null;
  finish: string | null;
  pct: number;
  preds: MppPredecessor[];
  isSummary: boolean;
  outlineLevel: number;
  outlineNumber: string;
  milestone: boolean;
  durationDays: number | null;
  resources: string[];
  notes: string;
}
