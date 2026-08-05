/**
 * Pure form defaults + job-type catalog for ProjectFormModal.
 * JOB_TYPES kept in sync with projects_job_type_check (migration 063).
 */

export const EMPTY_PROJECT_FORM = {
  project_number: "",
  name: "",
  client: "",
  general_contractor: "",
  engineer_of_record: "",
  project_manager: "",
  superintendent: "",
  contract_type: "Lump Sum",
  original_contract_value: 0,
  start_date: null as string | null,
  target_completion_date: null as string | null,
  forecast_completion_date: null as string | null,
  phase: "Detailing",
  health_status: "On Track",
  retainage_percent: 10,
  contingency_amount: 0,
  address: "",
  notes: "",
  job_type: null as string | null,
};

export const JOB_TYPES = [
  "Beams/Deck",
  "Beams/Joists/Deck",
  "Joist Deck",
  "Tilt",
  "Tilt Hybrid",
  "Misc.",
  "Other",
] as const;
