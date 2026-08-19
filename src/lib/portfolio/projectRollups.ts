/**
 * Server-side portfolio rollup rows from public.portfolio_project_rollups().
 *
 * One row per live project the caller can see (RLS + user_has_project_access).
 * Counts use the same predicates as the client KPI/health helpers; see the
 * migration comment for the few documented RFI-status variants.
 */
import { supabase } from "@/lib/supabase";

export interface PortfolioProjectRollup {
  project_id: string;
  wp_count: number;
  wp_complete_count: number;
  wp_tons: number;
  shop_hours_budget: number;
  shop_hours_actual: number;
  approved_co_value: number;
  pending_co_count: number;
  pending_co_value: number;
  budget_amount: number;
  committed_cost: number;
  actual_cost: number;
  forecast_to_complete: number;
  /** Scoring: status not answered/closed/void (case-insensitive). */
  open_rfis: number;
  /** Scoring: open + COALESCE(due_date, date_required) < today. */
  overdue_rfis: number;
  /** Scoring: open + priority Critical/High. */
  high_priority_open_rfis: number;
  /** Operational health: Open / Under Review / Incomplete Response + due < today. */
  ops_overdue_rfis: number;
  /** Operational health: ops overdue + priority Critical. */
  critical_overdue_rfis: number;
  /**
   * Projects KPI (calcRfiHealth): status not exactly Answered/Closed.
   * Void counts as open here.
   */
  kpi_open_rfis: number;
  /** Projects KPI: kpi-open + date_required < today. */
  kpi_overdue_rfis: number;
  late_deliveries: number;
  overdue_action_items: number;
  overdue_schedule_tasks: number;
  delayed_schedule_tasks: number;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asId(value: unknown): string {
  return String(value || "");
}

export function normalizePortfolioProjectRollup(
  row: Record<string, unknown> | null | undefined,
): PortfolioProjectRollup | null {
  const projectId = asId(row?.project_id);
  if (!projectId) return null;
  return {
    project_id: projectId,
    wp_count: asNumber(row?.wp_count),
    wp_complete_count: asNumber(row?.wp_complete_count),
    wp_tons: asNumber(row?.wp_tons),
    shop_hours_budget: asNumber(row?.shop_hours_budget),
    shop_hours_actual: asNumber(row?.shop_hours_actual),
    approved_co_value: asNumber(row?.approved_co_value),
    pending_co_count: asNumber(row?.pending_co_count),
    pending_co_value: asNumber(row?.pending_co_value),
    budget_amount: asNumber(row?.budget_amount),
    committed_cost: asNumber(row?.committed_cost),
    actual_cost: asNumber(row?.actual_cost),
    forecast_to_complete: asNumber(row?.forecast_to_complete),
    open_rfis: asNumber(row?.open_rfis),
    overdue_rfis: asNumber(row?.overdue_rfis),
    high_priority_open_rfis: asNumber(row?.high_priority_open_rfis),
    ops_overdue_rfis: asNumber(row?.ops_overdue_rfis),
    critical_overdue_rfis: asNumber(row?.critical_overdue_rfis),
    kpi_open_rfis: asNumber(row?.kpi_open_rfis),
    kpi_overdue_rfis: asNumber(row?.kpi_overdue_rfis),
    late_deliveries: asNumber(row?.late_deliveries),
    overdue_action_items: asNumber(row?.overdue_action_items),
    overdue_schedule_tasks: asNumber(row?.overdue_schedule_tasks),
    delayed_schedule_tasks: asNumber(row?.delayed_schedule_tasks),
  };
}

export const EMPTY_PORTFOLIO_ROLLUP: Omit<PortfolioProjectRollup, "project_id"> = {
  wp_count: 0,
  wp_complete_count: 0,
  wp_tons: 0,
  shop_hours_budget: 0,
  shop_hours_actual: 0,
  approved_co_value: 0,
  pending_co_count: 0,
  pending_co_value: 0,
  budget_amount: 0,
  committed_cost: 0,
  actual_cost: 0,
  forecast_to_complete: 0,
  open_rfis: 0,
  overdue_rfis: 0,
  high_priority_open_rfis: 0,
  ops_overdue_rfis: 0,
  critical_overdue_rfis: 0,
  kpi_open_rfis: 0,
  kpi_overdue_rfis: 0,
  late_deliveries: 0,
  overdue_action_items: 0,
  overdue_schedule_tasks: 0,
  delayed_schedule_tasks: 0,
};

export async function fetchPortfolioProjectRollups(): Promise<PortfolioProjectRollup[]> {
  const callRpc = supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, never>,
  ) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  const { data, error } = await callRpc("portfolio_project_rollups");
  if (error) throw error;
  return (data ?? [])
    .map((row) => normalizePortfolioProjectRollup(row))
    .filter((row): row is PortfolioProjectRollup => row !== null);
}
