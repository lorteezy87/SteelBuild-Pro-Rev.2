/**
 * Narrow PostgREST column lists for KPI / health rollups.
 *
 * Portfolio, Projects, and RFI hero health only read a handful of fields.
 * Callers must use a distinct query key (e.g. `projects-kpi`) so a slim
 * projection cannot poison a full-row cache used by a register or form.
 * Column names are real `public` table columns only.
 */

export const WP_KPI_COLUMNS =
  "id,project_id,status,tonnage,shop_hours_budget,shop_hours_actual,percent_complete";

export const RFI_KPI_COLUMNS = "id,project_id,status,date_required,due_date,priority";

export const CO_KPI_COLUMNS = "id,project_id,status,co_amount";

export const SCHEDULE_KPI_COLUMNS =
  "id,project_id,start_date,end_date,status,percent_complete,parent_task_id,is_summary,task_name";

export const COST_CODE_KPI_COLUMNS =
  "id,project_id,budget_amount,committed_cost,actual_cost,forecast_to_complete";

export const DELIVERY_KPI_COLUMNS = "id,project_id,status,scheduled_date,actual_date";

export const ACTION_ITEM_KPI_COLUMNS = "id,project_id,status,due_date";
