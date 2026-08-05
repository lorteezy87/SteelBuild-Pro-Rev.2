export interface Submittal {
  id?: string;
  status?: string;
  ball_in_court?: string;
  submittal_number?: string;
  title?: string;
  round_number?: number;
  drawing_set_ids?: string[];
  linked_rfi_ids?: string[];
  linked_task_ids?: string[];
  required_date?: string | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  returned_date?: string | null;
  spec_section?: string;
  discipline?: string;
  submittal_type?: string;
  project_id?: string;
  notes?: string | null;
  /** Phase 3 splitting: parent this row was spun off from (null = top-level). */
  parent_submittal_id?: string | null;
  /** Phase 3 splitting: why this child was spun off (null for non-children). */
  split_reason?: string | null;
  [key: string]: any;
}

export interface DrawingSet {
  id?: string;
  set_name?: string;
  revision?: string | number;
  discipline?: string;
  is_deleted?: boolean;
  [key: string]: any;
}

export type DrawingSetsById = Map<string, DrawingSet>;

export interface SubmittalRoundRecord {
  id?: string;
  submittal_id?: string;
  round_number?: number;
  drawing_set_ids?: string[];
  [key: string]: any;
}
