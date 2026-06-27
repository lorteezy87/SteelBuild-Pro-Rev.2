-- ============================================================================
-- Migration 013: Enterprise Data Integrity
-- Adds NOT NULL constraints, CHECK constraints on enum fields,
-- UNIQUE constraints on business-critical sequences, and numeric range checks.
-- ============================================================================

-- ─── 1. NOT NULL on project_id for ALL project-scoped tables ─────────────────
-- Every project-scoped record MUST belong to a project.
-- RLS depends on project_id being non-null to enforce row isolation.

ALTER TABLE rfis                    ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE action_items            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE change_orders           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE change_requests         ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE deliveries              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE work_packages           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE scope_items             ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE documents               ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE drawings                ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE drawing_sets            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE expenses                ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE inspections             ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE meetings                ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE photos                  ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE punchlist_items         ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE quality_control_records ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE safety_incidents        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE production_notes        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE warranties              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE resources               ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE look_ahead              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE activities              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE uploaded_files          ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE cost_codes              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE sov_items               ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE schedule_tasks          ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE daily_logs              ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE contacts                ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE alerts                  ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE project_closeout        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE pma_decisions           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE pma_assumptions         ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE pma_audit_logs          ALTER COLUMN project_id SET NOT NULL;


-- ─── 2. NOT NULL + DEFAULT on status / priority fields ──────────────────────
-- Ensures every record has a valid state from creation.

ALTER TABLE rfis               ALTER COLUMN status   SET NOT NULL;
ALTER TABLE rfis               ALTER COLUMN priority SET NOT NULL;
ALTER TABLE action_items       ALTER COLUMN status   SET NOT NULL;
ALTER TABLE action_items       ALTER COLUMN priority SET NOT NULL;
ALTER TABLE change_orders      ALTER COLUMN status   SET NOT NULL;
ALTER TABLE change_requests    ALTER COLUMN status   SET NOT NULL;
ALTER TABLE change_requests    ALTER COLUMN priority SET NOT NULL;
ALTER TABLE deliveries         ALTER COLUMN status   SET NOT NULL;
ALTER TABLE deliveries         ALTER COLUMN priority SET NOT NULL;
ALTER TABLE work_packages      ALTER COLUMN status   SET NOT NULL;
ALTER TABLE inspections        ALTER COLUMN status   SET NOT NULL;
ALTER TABLE punchlist_items    ALTER COLUMN status   SET NOT NULL;
ALTER TABLE punchlist_items    ALTER COLUMN priority SET NOT NULL;
ALTER TABLE safety_incidents   ALTER COLUMN status   SET NOT NULL;
ALTER TABLE safety_incidents   ALTER COLUMN severity SET NOT NULL;
ALTER TABLE schedule_tasks     ALTER COLUMN status   SET NOT NULL;
ALTER TABLE scope_items        ALTER COLUMN item_type SET NOT NULL;
ALTER TABLE alerts             ALTER COLUMN severity SET NOT NULL;
ALTER TABLE alerts             ALTER COLUMN status   SET NOT NULL;
ALTER TABLE projects           ALTER COLUMN phase    SET NOT NULL;
ALTER TABLE projects           ALTER COLUMN health_status SET NOT NULL;


-- ─── 3. CHECK constraints on enum/status fields ─────────────────────────────
-- Each constraint allows ALL values the frontend uses + current DB data.

-- RFIs
ALTER TABLE rfis ADD CONSTRAINT chk_rfis_status
  CHECK (status IN ('Open','Under Review','Answered','Closed'));
ALTER TABLE rfis ADD CONSTRAINT chk_rfis_priority
  CHECK (priority IN ('Low','Medium','High','Critical'));

-- Action Items
ALTER TABLE action_items ADD CONSTRAINT chk_action_items_status
  CHECK (status IN ('Open','In Progress','Resolved','Closed'));
ALTER TABLE action_items ADD CONSTRAINT chk_action_items_priority
  CHECK (priority IN ('Low','Medium','High','Critical'));

-- Change Orders
ALTER TABLE change_orders ADD CONSTRAINT chk_change_orders_status
  CHECK (status IN ('Draft','Submitted','Under Review','Approved','Rejected','Void'));

-- Change Requests
ALTER TABLE change_requests ADD CONSTRAINT chk_change_requests_status
  CHECK (status IN ('Submitted','Under Review','Approved','Rejected','Deferred'));
ALTER TABLE change_requests ADD CONSTRAINT chk_change_requests_priority
  CHECK (priority IN ('Low','Medium','High','Critical'));

-- Deliveries
ALTER TABLE deliveries ADD CONSTRAINT chk_deliveries_status
  CHECK (status IN ('Scheduled','In Transit','Delivered','Partial','Rejected','Delayed'));
ALTER TABLE deliveries ADD CONSTRAINT chk_deliveries_priority
  CHECK (priority IN ('Critical','High','Normal','Low'));

-- Work Packages
ALTER TABLE work_packages ADD CONSTRAINT chk_work_packages_status
  CHECK (status IN ('Not Started','In Progress','Complete','On Hold'));

-- Inspections
ALTER TABLE inspections ADD CONSTRAINT chk_inspections_status
  CHECK (status IN ('Scheduled','In Progress','Completed','On Hold','Cancelled'));

-- Punchlist Items
ALTER TABLE punchlist_items ADD CONSTRAINT chk_punchlist_status
  CHECK (status IN ('Open','In Progress','Completed','On Hold','Deferred'));
ALTER TABLE punchlist_items ADD CONSTRAINT chk_punchlist_priority
  CHECK (priority IN ('Critical','High','Medium','Low'));

-- Safety Incidents
ALTER TABLE safety_incidents ADD CONSTRAINT chk_safety_status
  CHECK (status IN ('Open','Under Investigation','Action Plan','In Progress','Completed','Closed'));
ALTER TABLE safety_incidents ADD CONSTRAINT chk_safety_severity
  CHECK (severity IN ('Critical','High','Medium','Low'));

-- Schedule Tasks
ALTER TABLE schedule_tasks ADD CONSTRAINT chk_schedule_tasks_status
  CHECK (status IN ('Not Started','In Progress','Complete','On Hold','Delayed'));

-- Scope Items
ALTER TABLE scope_items ADD CONSTRAINT chk_scope_items_type
  CHECK (item_type IN ('Scope','Exclusion','Clarification'));

-- Projects
ALTER TABLE projects ADD CONSTRAINT chk_projects_phase
  CHECK (phase IN ('Pre-Construction','Detailing','Procurement','Fabrication','Delivery','Installation','Erection','Closeout'));
ALTER TABLE projects ADD CONSTRAINT chk_projects_health
  CHECK (health_status IN ('On Track','Watch','At Risk','Awaiting Data'));

-- Alerts
ALTER TABLE alerts ADD CONSTRAINT chk_alerts_severity
  CHECK (severity IN ('Critical','High','Medium','Low'));
ALTER TABLE alerts ADD CONSTRAINT chk_alerts_status
  CHECK (status IN ('Active','Acknowledged','Resolved','Dismissed'));


-- ─── 4. UNIQUE constraints on business-critical sequenced fields ─────────────
-- Prevents duplicate numbering within a project.

ALTER TABLE rfis ADD CONSTRAINT uq_rfis_project_number
  UNIQUE (project_id, rfi_number);

-- change_orders.co_number may be NULL until assigned; partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_change_orders_project_number
  ON change_orders (project_id, co_number)
  WHERE co_number IS NOT NULL;


-- ─── 5. Numeric range constraints ───────────────────────────────────────────
-- Prevent nonsensical negative values in financial / percentage fields.

ALTER TABLE projects ADD CONSTRAINT chk_projects_retainage
  CHECK (retainage_percent >= 0 AND retainage_percent <= 100);

ALTER TABLE projects ADD CONSTRAINT chk_projects_contract_value
  CHECK (original_contract_value >= 0);

ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount
  CHECK (amount >= 0);


-- ─── 6. Inspection sign-off status ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'sign_off_status'
  ) THEN
    EXECUTE 'ALTER TABLE inspections ADD CONSTRAINT chk_inspections_signoff
      CHECK (sign_off_status IN (''Pending'',''Approved'',''Conditional Approval'',''Rejected''))';
  END IF;
END $$;


-- ─── 7. Drawing stage constraint ────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drawings' AND column_name = 'stage'
  ) THEN
    EXECUTE 'ALTER TABLE drawings ADD CONSTRAINT chk_drawings_stage
      CHECK (stage IN (''Not Started'',''OFA'',''BFA'',''OFS'',''BFS'',''FFF'',''Released''))';
  END IF;
END $$;
