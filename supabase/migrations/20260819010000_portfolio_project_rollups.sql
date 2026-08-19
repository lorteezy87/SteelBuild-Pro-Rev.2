-- Per-project portfolio / Projects KPI rollup.
--
-- PortfolioHub and /Projects previously paged every matching WP / RFI / CO /
-- cost-code / delivery / action / schedule / expense row into the browser and
-- aggregated in JS. This SECURITY INVOKER function returns one row per live
-- project the caller can see so those pages can score from counts.
--
-- Predicates match the client helpers. A few RFI counters coexist because the
-- UI already uses three slightly different open/overdue definitions:
--   open_rfis / overdue_rfis / high_priority_open_rfis
--     → portfolioHealthScoring (lower(status) not in answered/closed/void;
--       due = COALESCE(due_date, date_required); High/Critical exact case)
--   ops_overdue_rfis / critical_overdue_rfis
--     → deriveOperationalHealth (Open / Under Review / Incomplete Response;
--       due = COALESCE(date_required, due_date); Critical case-insensitive)
--   kpi_open_rfis / kpi_overdue_rfis
--     → calcRfiHealth (status not exactly Answered/Closed; Void stays open;
--       due = date_required only)
--
-- Spend uses preferManualActual: a typed cost-code actual/committed > 0 wins,
-- else the expense rollup; unmapped (or blank-code) expenses still count.
-- Never read the legacy cost_codes.budget / actual / committed columns.

BEGIN;

CREATE OR REPLACE FUNCTION public.portfolio_project_rollups()
RETURNS TABLE (
  project_id uuid,
  wp_count integer,
  wp_complete_count integer,
  wp_tons numeric,
  shop_hours_budget numeric,
  shop_hours_actual numeric,
  approved_co_value numeric,
  pending_co_count integer,
  pending_co_value numeric,
  budget_amount numeric,
  committed_cost numeric,
  actual_cost numeric,
  forecast_to_complete numeric,
  open_rfis integer,
  overdue_rfis integer,
  high_priority_open_rfis integer,
  ops_overdue_rfis integer,
  critical_overdue_rfis integer,
  kpi_open_rfis integer,
  kpi_overdue_rfis integer,
  late_deliveries integer,
  overdue_action_items integer,
  overdue_schedule_tasks integer,
  delayed_schedule_tasks integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH live_projects AS (
    SELECT p.id
    FROM public.projects p
    WHERE COALESCE(p.is_deleted, false) = false
      AND public.user_has_project_access(p.id)
  ),
  wp AS (
    SELECT
      w.project_id,
      COUNT(*)::integer AS wp_count,
      COUNT(*) FILTER (WHERE w.status = 'Complete')::integer AS wp_complete_count,
      COALESCE(SUM(w.tonnage), 0) AS wp_tons,
      COALESCE(SUM(w.shop_hours_budget), 0) AS shop_hours_budget,
      COALESCE(SUM(w.shop_hours_actual), 0) AS shop_hours_actual
    FROM public.work_packages w
    JOIN live_projects lp ON lp.id = w.project_id
    WHERE COALESCE(w.is_deleted, false) = false
    GROUP BY w.project_id
  ),
  co AS (
    SELECT
      c.project_id,
      COALESCE(SUM(c.co_amount) FILTER (WHERE btrim(c.status) = 'Approved'), 0) AS approved_co_value,
      COUNT(*) FILTER (WHERE c.status IN ('Submitted', 'Under Review'))::integer AS pending_co_count,
      COALESCE(SUM(c.co_amount) FILTER (WHERE c.status IN ('Submitted', 'Under Review')), 0) AS pending_co_value
    FROM public.change_orders c
    JOIN live_projects lp ON lp.id = c.project_id
    WHERE COALESCE(c.is_deleted, false) = false
    GROUP BY c.project_id
  ),
  exp_live AS (
    SELECT
      e.project_id,
      NULLIF(btrim(e.cost_code), '') AS cost_code,
      COALESCE(e.amount, 0) AS amount,
      lower(COALESCE(e.payment_status, '')) AS payment_status
    FROM public.expenses e
    JOIN live_projects lp ON lp.id = e.project_id
    WHERE COALESCE(e.is_deleted, false) = false
      AND lower(COALESCE(e.payment_status, '')) NOT IN ('voided', 'void')
  ),
  exp_by_code AS (
    SELECT
      project_id,
      cost_code,
      SUM(amount) AS committed_exp,
      SUM(amount) FILTER (WHERE payment_status = 'paid') AS paid_exp
    FROM exp_live
    WHERE cost_code IS NOT NULL
    GROUP BY project_id, cost_code
  ),
  spend_mapped AS (
    SELECT
      cc.project_id,
      COALESCE(SUM(cc.budget_amount), 0) AS budget_amount,
      COALESCE(SUM(cc.forecast_to_complete), 0) AS forecast_to_complete,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(cc.actual_cost, 0) > 0 THEN cc.actual_cost
          ELSE COALESCE(eb.paid_exp, 0)
        END
      ), 0) AS mapped_actual,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(cc.committed_cost, 0) > 0 THEN cc.committed_cost
          ELSE COALESCE(eb.committed_exp, 0)
        END
      ), 0) AS mapped_committed
    FROM public.cost_codes cc
    JOIN live_projects lp ON lp.id = cc.project_id
    LEFT JOIN exp_by_code eb
      ON eb.project_id = cc.project_id
     AND eb.cost_code = NULLIF(btrim(cc.cost_code_number), '')
    GROUP BY cc.project_id
  ),
  spend_unmapped AS (
    SELECT
      e.project_id,
      COALESCE(SUM(e.amount), 0) AS unmapped_committed,
      COALESCE(SUM(e.amount) FILTER (WHERE e.payment_status = 'paid'), 0) AS unmapped_actual
    FROM exp_live e
    WHERE e.cost_code IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.cost_codes cc
         WHERE cc.project_id = e.project_id
           AND NULLIF(btrim(cc.cost_code_number), '') = e.cost_code
       )
    GROUP BY e.project_id
  ),
  spend AS (
    SELECT
      COALESCE(m.project_id, u.project_id) AS project_id,
      COALESCE(m.budget_amount, 0) AS budget_amount,
      COALESCE(m.forecast_to_complete, 0) AS forecast_to_complete,
      COALESCE(m.mapped_actual, 0) + COALESCE(u.unmapped_actual, 0) AS actual_cost,
      COALESCE(m.mapped_committed, 0) + COALESCE(u.unmapped_committed, 0) AS committed_cost
    FROM spend_mapped m
    FULL OUTER JOIN spend_unmapped u ON u.project_id = m.project_id
  ),
  rfi AS (
    SELECT
      r.project_id,
      COUNT(*) FILTER (
        WHERE lower(btrim(r.status)) NOT IN ('answered', 'closed', 'void')
      )::integer AS open_rfis,
      COUNT(*) FILTER (
        WHERE lower(btrim(r.status)) NOT IN ('answered', 'closed', 'void')
          AND COALESCE(r.due_date, r.date_required)::date < CURRENT_DATE
      )::integer AS overdue_rfis,
      COUNT(*) FILTER (
        WHERE lower(btrim(r.status)) NOT IN ('answered', 'closed', 'void')
          AND r.priority IN ('Critical', 'High')
      )::integer AS high_priority_open_rfis,
      COUNT(*) FILTER (
        WHERE lower(btrim(r.status)) IN ('open', 'under review', 'incomplete response')
          AND COALESCE(r.date_required, r.due_date)::date < CURRENT_DATE
      )::integer AS ops_overdue_rfis,
      COUNT(*) FILTER (
        WHERE lower(btrim(r.status)) IN ('open', 'under review', 'incomplete response')
          AND COALESCE(r.date_required, r.due_date)::date < CURRENT_DATE
          AND lower(btrim(r.priority)) = 'critical'
      )::integer AS critical_overdue_rfis,
      COUNT(*) FILTER (
        WHERE r.status NOT IN ('Answered', 'Closed')
      )::integer AS kpi_open_rfis,
      COUNT(*) FILTER (
        WHERE r.status NOT IN ('Answered', 'Closed')
          AND r.date_required IS NOT NULL
          AND r.date_required::date < CURRENT_DATE
      )::integer AS kpi_overdue_rfis
    FROM public.rfis r
    JOIN live_projects lp ON lp.id = r.project_id
    WHERE COALESCE(r.is_deleted, false) = false
    GROUP BY r.project_id
  ),
  delivery AS (
    SELECT
      d.project_id,
      COUNT(*) FILTER (
        WHERE position('delivered' IN lower(COALESCE(d.status, ''))) = 0
          AND d.scheduled_date IS NOT NULL
          AND d.scheduled_date < now()
      )::integer AS late_deliveries
    FROM public.deliveries d
    JOIN live_projects lp ON lp.id = d.project_id
    WHERE COALESCE(d.is_deleted, false) = false
    GROUP BY d.project_id
  ),
  action_item AS (
    SELECT
      a.project_id,
      COUNT(*) FILTER (
        WHERE lower(btrim(a.status)) NOT IN ('complete', 'cancelled', 'closed')
          AND a.due_date IS NOT NULL
          AND a.due_date::date < CURRENT_DATE
      )::integer AS overdue_action_items
    FROM public.action_items a
    JOIN live_projects lp ON lp.id = a.project_id
    GROUP BY a.project_id
  ),
  schedule AS (
    SELECT
      st.project_id,
      COUNT(*) FILTER (
        WHERE NOT COALESCE(st.is_summary, false)
          AND NOT EXISTS (
            SELECT 1
            FROM public.schedule_tasks child
            WHERE child.parent_task_id = st.id
          )
          AND COALESCE(st.percent_complete, 0) < 100
          AND st.status IS DISTINCT FROM 'Complete'
          AND st.end_date IS NOT NULL
          AND st.end_date::date < CURRENT_DATE
      )::integer AS overdue_schedule_tasks,
      COUNT(*) FILTER (
        WHERE position('delay' IN lower(COALESCE(st.status, ''))) > 0
      )::integer AS delayed_schedule_tasks
    FROM public.schedule_tasks st
    JOIN live_projects lp ON lp.id = st.project_id
    GROUP BY st.project_id
  )
  SELECT
    lp.id AS project_id,
    COALESCE(wp.wp_count, 0),
    COALESCE(wp.wp_complete_count, 0),
    COALESCE(wp.wp_tons, 0),
    COALESCE(wp.shop_hours_budget, 0),
    COALESCE(wp.shop_hours_actual, 0),
    COALESCE(co.approved_co_value, 0),
    COALESCE(co.pending_co_count, 0),
    COALESCE(co.pending_co_value, 0),
    COALESCE(spend.budget_amount, 0),
    COALESCE(spend.committed_cost, 0),
    COALESCE(spend.actual_cost, 0),
    COALESCE(spend.forecast_to_complete, 0),
    COALESCE(rfi.open_rfis, 0),
    COALESCE(rfi.overdue_rfis, 0),
    COALESCE(rfi.high_priority_open_rfis, 0),
    COALESCE(rfi.ops_overdue_rfis, 0),
    COALESCE(rfi.critical_overdue_rfis, 0),
    COALESCE(rfi.kpi_open_rfis, 0),
    COALESCE(rfi.kpi_overdue_rfis, 0),
    COALESCE(delivery.late_deliveries, 0),
    COALESCE(action_item.overdue_action_items, 0),
    COALESCE(schedule.overdue_schedule_tasks, 0),
    COALESCE(schedule.delayed_schedule_tasks, 0)
  FROM live_projects lp
  LEFT JOIN wp ON wp.project_id = lp.id
  LEFT JOIN co ON co.project_id = lp.id
  LEFT JOIN spend ON spend.project_id = lp.id
  LEFT JOIN rfi ON rfi.project_id = lp.id
  LEFT JOIN delivery ON delivery.project_id = lp.id
  LEFT JOIN action_item ON action_item.project_id = lp.id
  LEFT JOIN schedule ON schedule.project_id = lp.id;
$$;

REVOKE ALL ON FUNCTION public.portfolio_project_rollups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_project_rollups() TO authenticated;

COMMENT ON FUNCTION public.portfolio_project_rollups() IS
  'Per-project KPI/health counts for Portfolio and Projects. SECURITY INVOKER so RLS applies; also gated by user_has_project_access.';

COMMIT;
