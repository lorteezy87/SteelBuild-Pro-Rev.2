import type {
  ChangeOrderLike,
  CostCodeLike,
  ExpenseLike,
  ProjectContractLike,
} from "@/services/costRollup";

export type NumericValue = number | string | null | undefined;
export type DateValue = string | number | Date | null | undefined;

export interface ProjectMetricInput extends ProjectContractLike {
  start_date?: DateValue;
  target_completion_date?: DateValue;
  forecast_completion_date?: DateValue;
}

export interface ChangeOrderMetricInput extends ChangeOrderLike {
  is_deleted?: boolean | null;
}

export interface CostCodeMetricInput extends CostCodeLike {
  cost_code_number?: string | number | null;
}

export interface ExpenseMetricInput extends ExpenseLike {
  expense_date?: DateValue;
}

export interface BudgetHourItemInput {
  is_deleted?: boolean | null;
  category?: string | null;
  shop_hours_budget?: NumericValue;
  shop_hours_actual?: NumericValue;
  field_hours_budget?: NumericValue;
  field_hours_actual?: NumericValue;
  metadata?: {
    linked_work_package_ids?: readonly string[] | null;
    [key: string]: unknown;
  } | null;
}

export interface WorkPackageMetricInput {
  id?: string | null;
  phase?: string | null;
  status?: string | null;
  percent_complete?: NumericValue;
  tonnage?: NumericValue;
  shop_hours_actual?: NumericValue;
  field_hours_actual?: NumericValue;
  scheduled_end_date?: DateValue;
  released_date?: DateValue;
  vif_confirmed?: boolean | null;
  load_list_complete?: boolean | null;
}

export interface DeliveryMetricInput {
  delivery_type?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
  procurement_category?: string | null;
  weight_tons?: NumericValue;
  is_long_lead?: boolean | null;
  lead_time_weeks?: NumericValue;
  expected_ship_date?: DateValue;
  order_placed_date?: DateValue;
  required_date?: DateValue;
  scheduled_date?: DateValue;
}

export interface RfiMetricInput {
  status?: string | null;
  date_required?: DateValue;
  submitted_date?: DateValue;
  created_at?: DateValue;
  ball_in_court?: string | null;
}

export interface SubmittalMetricInput {
  id?: string | number | null;
  is_deleted?: boolean | null;
  status?: string | null;
  ball_in_court?: string | null;
}

export interface SovItemMetricInput {
  project_id?: string | null;
  line_item_number?: string | number | null;
  application_number?: NumericValue;
  status?: string | null;
  is_deleted?: boolean | null;
  scheduled_value?: NumericValue;
  current_percent_complete?: NumericValue;
  previous_percent_complete?: NumericValue;
  retainage_percent?: NumericValue;
  payment_received_date?: DateValue;
  submitted_date?: DateValue;
  period_to?: DateValue;
}

export interface ScheduleTaskMetricInput {
  id?: string | number | null;
  task_type?: string | null;
  status?: string | null;
  task_name?: string | null;
  start_date?: DateValue;
  end_date?: DateValue;
  metadata?: {
    is_critical?: boolean;
    [key: string]: unknown;
  } | null;
}

export interface DrawingActivityMetricInput {
  id?: string | number | null;
  event_type?: string | null;
  from_value?: unknown;
  to_value?: unknown;
  created_at?: DateValue;
  metadata?: {
    set_name?: string | null;
    sheet_number?: string | null;
    drawing_number?: string | null;
    [key: string]: unknown;
  } | null;
}

export interface BudgetHoursVariance {
  shopBudget: number;
  shopActual: number;
  shopVariancePct: number;
  fieldBudget: number;
  fieldActual: number;
  fieldVariancePct: number;
  totalBudget: number;
  totalActual: number;
  totalVariancePct: number;
  hasBudget: boolean;
}

export type FabStage =
  | "drawings_approved"
  | "material_on_hand"
  | "shop_released"
  | "in_fabrication"
  | "fabricated"
  | "finish_treatment"
  | "ready_to_ship";

export interface FabStatusRollup {
  stages: FabStage[];
  counts: Record<FabStage, number>;
  total: number;
  totalTons: number;
  shippedTons: number;
  activeStage: FabStage;
}

export type ProcurementStage =
  | "Identified"
  | "Quoted"
  | "PO Issued"
  | "Confirmed"
  | "In Production"
  | "Shipped"
  | "Received";

export interface ProcurementStatusRollup {
  stages: ProcurementStage[];
  counts: Record<ProcurementStage, number>;
  total: number;
  totalWeight: number;
  longLead: number;
  longLeadSlipping: number;
  cancelled: number;
  overdue: number;
  activeStage: ProcurementStage;
}

export type ProjectPhase = "Detailing" | "Fabrication" | "Delivery" | "Erection";

export interface PhaseRollup {
  phases: ProjectPhase[];
  counts: Record<ProjectPhase, number>;
  activeIdx: number;
}

export type WorkPackagePipelineStage =
  | "Not Started"
  | "Detailing"
  | "Released"
  | "Fabrication"
  | "Complete"
  | "Shipped";

export interface WorkPackagePipelineRollup {
  stages: WorkPackagePipelineStage[];
  counts: Record<WorkPackagePipelineStage, number>;
  total: number;
}

export type RfiStatus =
  | "Open"
  | "Under Review"
  | "Incomplete Response"
  | "Answered"
  | "Closed"
  | "Void";

export type RfiStatusRollup = Record<RfiStatus, number>;

export type SubmittalPipelineStage =
  | "IFA"
  | "OFA"
  | "BFA"
  | "R&R"
  | "OFS"
  | "IFC"
  | "Released";

export interface SubmittalPipelineRollup {
  stages: SubmittalPipelineStage[];
  counts: Record<SubmittalPipelineStage, number>;
  total: number;
}

export interface RfiAgingBucket {
  label: "0-7 DAYS" | "8-14 DAYS" | "15-30 DAYS" | "30+ DAYS";
  count: number;
  pct: number;
  color: string;
}

export interface BallInCourtRollup {
  Architect: number;
  Engineer: number;
  GC: number;
  Owner: number;
  Internal: number;
}

export interface PendingPayment {
  count: number;
  total: number;
}

export interface CertifiedPeriodDelta {
  projectId: string | null | undefined;
  lineItemNumber: string | number | null | undefined;
  applicationNumber: NumericValue;
  periodTo: DateValue;
  submittedDate: DateValue;
  delta: number;
}

export type TaskDistributionType =
  | "Fabrication"
  | "Delivery"
  | "Install"
  | "Submittal"
  | "Task"
  | "Milestone"
  | "Other";

export type TaskDistribution = Record<
  TaskDistributionType,
  { tasks: number; inProgress: number }
>;

export interface RecentActivityRow {
  id: string | number | null | undefined;
  summary: string;
  when: DateValue;
  kind: string;
  count: number;
}

export interface ProjectMilestone {
  id: string | number | null | undefined;
  title: string;
  date: DateValue;
  status: string | null;
  synthetic: boolean;
}

export interface CriticalPathTask {
  id: string | number | null | undefined;
  title: string;
  start: DateValue;
  end: DateValue;
  status: string | null;
}

export interface MonthlySpend {
  key: string;
  month: string;
  actual: number;
  committed: number;
}
