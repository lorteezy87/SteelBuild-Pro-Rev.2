-- SteelBuild Pro — Initial Supabase Schema
-- Run this in the Supabase SQL editor or via: supabase db push
--
-- All tables:
--   • Use UUID primary keys (auto-generated)
--   • Have created_at / updated_at timestamps
--   • Enable Row Level Security (RLS) — authenticated users get full CRUD
--   • Include a JSONB `metadata` column for any extra fields not explicitly defined

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Updated-at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper macro for adding the trigger to any table
-- Usage: SELECT add_updated_at_trigger('table_name');
CREATE OR REPLACE FUNCTION add_updated_at_trigger(tbl TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
    tbl, tbl
  );
END;
$$ LANGUAGE plpgsql;

-- ─── Number sequences (replaces Base44 secureNumberSequence function) ─────────
CREATE TABLE IF NOT EXISTS number_sequences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  project_id  UUID NOT NULL,
  record_type TEXT NOT NULL,
  next_value  INTEGER DEFAULT 1,
  UNIQUE (project_id, record_type)
);
SELECT add_updated_at_trigger('number_sequences');
ALTER TABLE number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON number_sequences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── User profiles (mirrors auth.users with extra app-level fields) ───────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  email       TEXT,
  full_name   TEXT,
  role        TEXT DEFAULT 'user',
  avatar_url  TEXT,
  metadata    JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('user_profiles');
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  project_number            TEXT,
  name                      TEXT NOT NULL,
  client                    TEXT,
  general_contractor        TEXT,
  engineer_of_record        TEXT,
  project_manager           TEXT,
  superintendent            TEXT,
  contract_type             TEXT,
  original_contract_value   NUMERIC,
  start_date                DATE,
  target_completion_date    DATE,
  forecast_completion_date  DATE,
  phase                     TEXT DEFAULT 'Pre-Construction',
  health_status             TEXT DEFAULT 'On Track',
  retainage_percent         NUMERIC DEFAULT 10,
  contingency_amount        NUMERIC,
  address                   TEXT,
  notes                     TEXT,
  metadata                  JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('projects');
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── RFIs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfis (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  project_id              UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name            TEXT,
  rfi_number              TEXT,
  title                   TEXT,
  description             TEXT,
  question                TEXT,
  answer                  TEXT,
  drawing_reference       TEXT,
  spec_section            TEXT,
  priority                TEXT DEFAULT 'Medium',
  status                  TEXT DEFAULT 'Open',
  submitted_by            TEXT,
  submitted_date          DATE,
  date_required           DATE,
  date_answered           DATE,
  assigned_to             TEXT,
  answered_by             TEXT,
  ball_in_court           TEXT DEFAULT 'Contractor',
  cost_impact             BOOLEAN DEFAULT false,
  cost_impact_amount      NUMERIC,
  schedule_impact         BOOLEAN DEFAULT false,
  schedule_impact_days    INTEGER,
  distribution_list       TEXT,
  created_date            TIMESTAMPTZ DEFAULT NOW(),
  metadata                JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('rfis');
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON rfis FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Cost Codes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_codes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  code         TEXT,
  description  TEXT,
  category     TEXT,
  budget       NUMERIC,
  actual       NUMERIC DEFAULT 0,
  committed    NUMERIC DEFAULT 0,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('cost_codes');
ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON cost_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Work Packages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_packages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name        TEXT,
  wp_number           TEXT,
  name                TEXT,
  phase               TEXT,
  released_date       DATE,
  status              TEXT DEFAULT 'Not Started',
  tonnage             NUMERIC,
  shop_hours_budget   NUMERIC,
  shop_hours_actual   NUMERIC DEFAULT 0,
  field_hours_budget  NUMERIC,
  field_hours_actual  NUMERIC DEFAULT 0,
  crew                TEXT,
  linked_drawing_ids  TEXT,
  linked_rfi_ids      TEXT,
  notes               TEXT,
  percent_complete    NUMERIC DEFAULT 0,
  vif_confirmed       BOOLEAN DEFAULT false,
  vif_confirmed_by    TEXT,
  vif_confirmed_date  DATE,
  load_list_complete  BOOLEAN DEFAULT false,
  sequence_confirmed  BOOLEAN DEFAULT false,
  metadata            JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('work_packages');
ALTER TABLE work_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON work_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Drawings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drawings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name     TEXT,
  drawing_id       TEXT,
  sheet_number     TEXT,
  title            TEXT,
  discipline       TEXT DEFAULT 'Structural',
  revision_number  TEXT DEFAULT '0',
  stage            TEXT DEFAULT 'Not Started',
  submitted_date   DATE,
  return_date      DATE,
  due_date         DATE,
  reviewer         TEXT,
  spec_section     TEXT,
  notes            TEXT,
  linked_rfi_ids   TEXT,
  priority_flag    BOOLEAN DEFAULT false,
  override_reason  TEXT,
  drawing_set_name TEXT,
  file_url         TEXT,
  metadata         JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('drawings');
ALTER TABLE drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON drawings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Drawing Sets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drawing_sets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  set_name    TEXT,
  description TEXT,
  issued_date DATE,
  revision    TEXT,
  status      TEXT,
  metadata    JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('drawing_sets');
ALTER TABLE drawing_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON drawing_sets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Change Orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name  TEXT,
  co_number     TEXT,
  title         TEXT,
  description   TEXT,
  reason_code   TEXT,
  status        TEXT DEFAULT 'Draft',
  cost_code_id  UUID,
  co_amount     NUMERIC,
  submitted_date DATE,
  approved_date  DATE,
  approved_by    TEXT,
  notes          TEXT,
  attachments    TEXT,
  metadata       JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('change_orders');
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON change_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Change Requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_requests (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  project_id                  UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name                TEXT,
  title                       TEXT,
  description                 TEXT,
  requested_by                TEXT,
  request_date                DATE,
  reason                      TEXT,
  affected_areas              TEXT,
  estimated_cost_impact       NUMERIC,
  estimated_schedule_impact_days INTEGER,
  priority                    TEXT DEFAULT 'Medium',
  status                      TEXT DEFAULT 'Submitted',
  scope_impact                TEXT,
  metadata                    JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('change_requests');
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON change_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Schedule Tasks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name    TEXT,
  task_name       TEXT,
  task_type       TEXT DEFAULT 'Task',
  phase           TEXT,
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'Not Started',
  priority        TEXT DEFAULT 'Normal',
  percent_complete NUMERIC DEFAULT 0,
  assigned_to     TEXT,
  notes           TEXT,
  dependencies    TEXT,
  milestone       BOOLEAN DEFAULT false,
  metadata        JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('schedule_tasks');
ALTER TABLE schedule_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON schedule_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Expenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name      TEXT,
  expense_number    TEXT,
  description       TEXT,
  expense_type      TEXT,
  cost_code         TEXT,
  cost_code_name    TEXT,
  amount            NUMERIC,
  quantity          NUMERIC DEFAULT 1,
  unit_cost         NUMERIC,
  unit              TEXT,
  vendor            TEXT,
  invoice_number    TEXT,
  invoice_date      DATE,
  payment_status    TEXT DEFAULT 'Unpaid',
  payment_date      DATE,
  work_package_id   UUID,
  work_package_name TEXT,
  sov_line_item_id  UUID,
  sov_line_item_name TEXT,
  expense_date      DATE,
  submitted_by      TEXT,
  approved_by       TEXT,
  approved_date     DATE,
  notes             TEXT,
  receipt_url       TEXT,
  tags              TEXT,
  metadata          JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('expenses');
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Deliveries ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name          TEXT,
  work_package_id       UUID,
  vendor                TEXT,
  po_number             TEXT,
  scheduled_date        DATE,
  required_date         DATE,
  actual_date           DATE,
  status                TEXT DEFAULT 'Scheduled',
  priority              TEXT DEFAULT 'Normal',
  pieces                INTEGER,
  weight_tons           NUMERIC,
  description           TEXT,
  notes                 TEXT,
  special_instructions  TEXT,
  carrier               TEXT,
  tracking_number       TEXT,
  received_by           TEXT,
  receiving_location    TEXT,
  contact_name          TEXT,
  contact_phone         TEXT,
  inspection_required   BOOLEAN DEFAULT false,
  delivery_type         TEXT,
  procurement_category  TEXT,
  metadata              JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('deliveries');
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── SOV Items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sov_items (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  project_id                UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name              TEXT,
  application_number        INTEGER,
  period_from               DATE,
  period_to                 DATE,
  line_item_number          INTEGER,
  description               TEXT,
  scheduled_value           NUMERIC,
  previous_percent_complete NUMERIC DEFAULT 0,
  current_percent_complete  NUMERIC DEFAULT 0,
  retainage_percent         NUMERIC DEFAULT 10,
  status                    TEXT DEFAULT 'Draft',
  metadata                  JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('sov_items');
ALTER TABLE sov_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON sov_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Vendors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  company_name         TEXT,
  vendor_type          TEXT,
  contact_person       TEXT,
  title                TEXT,
  phone                TEXT,
  email                TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT,
  zip                  TEXT,
  website              TEXT,
  certifications       TEXT,
  certifications_expiry DATE,
  insurance_provider   TEXT,
  insurance_expiry     DATE,
  years_in_business    INTEGER,
  status               TEXT DEFAULT 'Active',
  pricing_tier         TEXT DEFAULT 'Standard',
  payment_terms        TEXT,
  is_preferred         BOOLEAN DEFAULT false,
  metadata             JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('vendors');
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  first_name   TEXT,
  last_name    TEXT,
  company      TEXT,
  role         TEXT,
  contact_type TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('contacts');
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Daily Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name          TEXT,
  date                  DATE,
  superintendent        TEXT,
  crew_name             TEXT,
  headcount             INTEGER,
  hours_worked          NUMERIC,
  weather_description   TEXT,
  temperature           TEXT,
  wind_speed            TEXT,
  activities            TEXT,
  equipment_used        TEXT,
  delays                TEXT,
  delay_hours           NUMERIC,
  safety_incidents      INTEGER DEFAULT 0,
  safety_notes          TEXT,
  toolbox_talk_completed BOOLEAN DEFAULT false,
  status                TEXT DEFAULT 'Draft',
  photos                JSONB DEFAULT '[]',
  wp_progress           JSONB DEFAULT '[]',
  metadata              JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('daily_logs');
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON daily_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Meetings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name     TEXT,
  title            TEXT,
  meeting_type     TEXT,
  meeting_date     DATE,
  location         TEXT,
  attendees        TEXT,
  minutes          TEXT,
  status           TEXT DEFAULT 'Scheduled',
  next_meeting_date DATE,
  metadata         JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('meetings');
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Action Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name      TEXT,
  title             TEXT,
  description       TEXT,
  assigned_to       TEXT,
  due_date          DATE,
  priority          TEXT DEFAULT 'Medium',
  status            TEXT DEFAULT 'Open',
  meeting_reference TEXT,
  metadata          JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('action_items');
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON action_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Inspections ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name        TEXT,
  inspection_type     TEXT,
  inspection_date     DATE,
  location            TEXT,
  inspector_name      TEXT,
  inspector_role      TEXT,
  description         TEXT,
  status              TEXT DEFAULT 'Scheduled',
  findings            TEXT,
  deficiencies_count  INTEGER DEFAULT 0,
  corrective_actions  TEXT,
  sign_off_status     TEXT DEFAULT 'Pending',
  notes               TEXT,
  metadata            JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('inspections');
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Photos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  category     TEXT,
  title        TEXT,
  description  TEXT,
  location     TEXT,
  taken_date   DATE,
  file_url     TEXT,
  file_name    TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('photos');
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Punchlist Items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punchlist_items (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  project_id             UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name           TEXT,
  description            TEXT,
  category               TEXT,
  location               TEXT,
  assigned_to            TEXT,
  priority               TEXT DEFAULT 'Medium',
  status                 TEXT DEFAULT 'Open',
  target_completion_date DATE,
  percent_complete       NUMERIC DEFAULT 0,
  notes                  TEXT,
  metadata               JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('punchlist_items');
ALTER TABLE punchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON punchlist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Quality Control Records ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_control_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name          TEXT,
  test_type             TEXT,
  test_date             DATE,
  material_or_component TEXT,
  location              TEXT,
  test_lab_or_inspector TEXT,
  specification         TEXT,
  result                TEXT,
  test_value            TEXT,
  acceptance_criteria   TEXT,
  quantity_tested       INTEGER,
  quantity_passed       INTEGER,
  notes                 TEXT,
  status                TEXT DEFAULT 'Pending',
  metadata              JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('quality_control_records');
ALTER TABLE quality_control_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON quality_control_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Safety Incidents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_incidents (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  project_id               UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name             TEXT,
  incident_type            TEXT,
  severity                 TEXT DEFAULT 'Medium',
  incident_date            DATE,
  incident_time            TIME,
  location                 TEXT,
  reported_by              TEXT,
  description              TEXT,
  injuries                 TEXT,
  root_cause               TEXT,
  corrective_actions       TEXT,
  responsible_party        TEXT,
  action_due_date          DATE,
  status                   TEXT DEFAULT 'Open',
  investigation_completed  BOOLEAN DEFAULT false,
  safety_trained           BOOLEAN DEFAULT false,
  witnesses                TEXT,
  notes                    TEXT,
  metadata                 JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('safety_incidents');
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON safety_incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Production Notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  date        DATE,
  shift       TEXT,
  status      TEXT DEFAULT 'Draft',
  notes       TEXT,
  sketch_data TEXT,
  metadata    JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('production_notes');
ALTER TABLE production_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON production_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Warranties ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warranties (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  project_id           UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name         TEXT,
  warranty_type        TEXT,
  component_description TEXT,
  vendor_name          TEXT,
  vendor_contact       TEXT,
  vendor_phone         TEXT,
  vendor_email         TEXT,
  warranty_term_years  NUMERIC,
  coverage_percentage  NUMERIC,
  start_date           DATE,
  expiration_date      DATE,
  exclusions           TEXT,
  is_active            BOOLEAN DEFAULT true,
  notes                TEXT,
  metadata             JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('warranties');
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON warranties FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Resources ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  name         TEXT,
  resource_type TEXT,
  role         TEXT,
  capacity     NUMERIC,
  unit         TEXT,
  cost_rate    NUMERIC,
  availability TEXT,
  notes        TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('resources');
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON resources FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Look Ahead ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_ahead (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  week_start   DATE,
  week_end     DATE,
  tasks        JSONB DEFAULT '[]',
  constraints  TEXT,
  notes        TEXT,
  status       TEXT DEFAULT 'Draft',
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('look_ahead');
ALTER TABLE look_ahead ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON look_ahead FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Documents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name  TEXT,
  title         TEXT,
  document_type TEXT,
  category      TEXT,
  file_url      TEXT,
  file_name     TEXT,
  file_size     INTEGER,
  version       TEXT,
  status        TEXT,
  description   TEXT,
  uploaded_by   TEXT,
  tags          TEXT,
  metadata      JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('documents');
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Activity Feed ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  -- Note: some legacy code uses projectId (camelCase) — stored as project_id in DB
  entity_type  TEXT,
  entity_id    UUID,
  action       TEXT,
  description  TEXT,
  performed_by TEXT,
  timestamp    TIMESTAMPTZ DEFAULT NOW(),
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('activities');
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Uploaded Files ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type  TEXT,
  entity_id    UUID,
  file_name    TEXT,
  file_url     TEXT,
  file_size    INTEGER,
  content_type TEXT,
  uploaded_by  TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('uploaded_files');
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON uploaded_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Scope Items (Scope Exclusions) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scope_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  item_type    TEXT DEFAULT 'Exclusion',
  category     TEXT,
  description  TEXT,
  notes        TEXT,
  reference    TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('scope_items');
ALTER TABLE scope_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON scope_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Alerts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  alert_type   TEXT,
  severity     TEXT DEFAULT 'Medium',
  title        TEXT,
  description  TEXT,
  entity_type  TEXT,
  entity_id    UUID,
  status       TEXT DEFAULT 'Active',
  dismissed_at TIMESTAMPTZ,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('alerts');
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PMA — Assumptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pma_assumptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  title        TEXT,
  description  TEXT,
  category     TEXT,
  owner        TEXT,
  status       TEXT DEFAULT 'Open',
  risk_level   TEXT,
  notes        TEXT,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('pma_assumptions');
ALTER TABLE pma_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON pma_assumptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PMA — Decisions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pma_decisions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name   TEXT,
  title          TEXT,
  description    TEXT,
  decision_date  DATE,
  decided_by     TEXT,
  category       TEXT,
  impact         TEXT,
  alternatives   TEXT,
  rationale      TEXT,
  status         TEXT DEFAULT 'Open',
  metadata       JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('pma_decisions');
ALTER TABLE pma_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON pma_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PMA — Audit Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pma_audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type  TEXT,
  entity_id    UUID,
  action       TEXT,
  changed_by   TEXT,
  old_values   JSONB DEFAULT '{}',
  new_values   JSONB DEFAULT '{}',
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('pma_audit_logs');
ALTER TABLE pma_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON pma_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Project Closeout ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_closeout (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name          TEXT,
  closeout_date         DATE,
  status                TEXT DEFAULT 'In Progress',
  as_built_complete     BOOLEAN DEFAULT false,
  manuals_complete      BOOLEAN DEFAULT false,
  warranties_complete   BOOLEAN DEFAULT false,
  punchlist_complete    BOOLEAN DEFAULT false,
  final_inspection_date DATE,
  certificate_of_occupancy DATE,
  notes                 TEXT,
  checklist             JSONB DEFAULT '[]',
  metadata              JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('project_closeout');
ALTER TABLE project_closeout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON project_closeout FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket setup must be done separately.
-- See: supabase/migrations/002_storage.sql
