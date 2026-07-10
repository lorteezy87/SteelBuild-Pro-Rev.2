/**
 * validation.ts — Entity-specific validation rules.
 *
 * ONE place to define what makes a record valid for create/update.
 * No silent fallbacks — every validation returns explicit errors.
 *
 * Usage:
 *   import { validate } from "@/services/validation";
 *   const errors = validate("drawing", formData, "create");
 *   if (errors.length) { errors.forEach(e => toast.error(e.message)); return; }
 */

export interface ValidationError {
  field: string;
  message: string;
  rule: string;
}

export type ValidationMode = "create" | "update";

type RecordData = Record<string, any>;
type RuleFn = (data: RecordData, mode: ValidationMode) => ValidationError[];

// ─── Helpers ────────────────────────────────────────────────────────────

function required(value: any, field: string, label: string): ValidationError | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return { field, message: `${label} is required.`, rule: "REQUIRED" };
  }
  return null;
}

function nonNegativeNumber(value: any, field: string, label: string): ValidationError | null {
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    return { field, message: `${label} must not be negative.`, rule: "NON_NEGATIVE" };
  }
  return null;
}

function validDate(value: any, field: string, label: string): ValidationError | null {
  if (!value) return null; // optional dates pass
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { field, message: `${label} is not a valid date.`, rule: "VALID_DATE" };
  }
  return null;
}

function dateNotBefore(
  value: any,
  beforeValue: any,
  field: string,
  label: string,
  beforeLabel: string,
): ValidationError | null {
  if (!value || !beforeValue) return null;
  if (new Date(value) < new Date(beforeValue)) {
    return { field, message: `${label} must not be before ${beforeLabel}.`, rule: "DATE_ORDER" };
  }
  return null;
}

function maxLength(value: any, max: number, field: string, label: string): ValidationError | null {
  if (typeof value === "string" && value.length > max) {
    return { field, message: `${label} must be ${max} characters or fewer.`, rule: "MAX_LENGTH" };
  }
  return null;
}

// ─── Entity rules ───────────────────────────────────────────────────────

const RULES: Record<string, RuleFn> = {

  drawing: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.sheet_number, "sheet_number", "Sheet Number"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(required(data.drawing_set_name, "drawing_set_name", "Drawing Set Name"));
    errors.push(validDate(data.due_date, "due_date", "Due Date"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(maxLength(data.sheet_number, 50, "sheet_number", "Sheet Number"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    errors.push(maxLength(data.drawing_set_name, 100, "drawing_set_name", "Drawing Set Name"));
    return errors.filter(Boolean) as ValidationError[];
  },

  delivery: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.description, "description", "Delivery Title"));
    errors.push(required(data.vendor, "vendor", "Vendor"));
    errors.push(required(data.scheduled_date, "scheduled_date", "Scheduled Date"));
    errors.push(validDate(data.scheduled_date, "scheduled_date", "Scheduled Date"));
    errors.push(validDate(data.required_date, "required_date", "Required Date"));
    errors.push(validDate(data.actual_date, "actual_date", "Actual Date"));
    errors.push(nonNegativeNumber(data.pieces || 0, "pieces", "Pieces"));
    errors.push(nonNegativeNumber(data.weight_tons || 0, "weight_tons", "Weight"));
    return errors.filter(Boolean) as ValidationError[];
  },

  rfi: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(required(data.ball_in_court, "ball_in_court", "Ball in Court"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(validDate(data.date_required, "date_required", "Date Required"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    return errors.filter(Boolean) as ValidationError[];
  },

  // NOTE: `expense` and `change_order` rules were removed 2026-07-10. They were
  // unreachable — the only callers were useFinancials' expenseCrud/changeOrderCrud
  // mutations, which nothing consumed. Expenses and change orders are written by
  // ExpenseFormModal / COFormModal, which validate locally with different rules
  // (e.g. the modal requires cost_code, the removed rule required vendor). If a
  // service rule is ever reinstated, reconcile it with the modal first.

  cost_code: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.cost_code_number, "cost_code_number", "Cost Code Number"));
    errors.push(required(data.description, "description", "Description"));
    errors.push(nonNegativeNumber(data.budget_amount || 0, "budget_amount", "Budget Amount"));
    return errors.filter(Boolean) as ValidationError[];
  },

  work_package: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.name, "name", "Name"));
    errors.push(required(data.wp_number, "wp_number", "WP Number"));
    errors.push(validDate(data.planned_start, "planned_start", "Planned Start"));
    errors.push(validDate(data.planned_end, "planned_end", "Planned End"));
    errors.push(dateNotBefore(data.planned_end, data.planned_start, "planned_end", "Planned End", "Planned Start"));
    return errors.filter(Boolean) as ValidationError[];
  },

  sov_item: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.description, "description", "Description"));
    errors.push(nonNegativeNumber(data.scheduled_value || 0, "scheduled_value", "Scheduled Value"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Date Submitted"));
    errors.push(validDate(data.payment_received_date, "payment_received_date", "Date Payment Received"));
    // Payment can't be received before submission
    errors.push(dateNotBefore(data.payment_received_date, data.submitted_date, "payment_received_date", "Date Payment Received", "Date Submitted"));
    return errors.filter(Boolean) as ValidationError[];
  },

  schedule_task: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.task_name, "task_name", "Task Name"));
    errors.push(validDate(data.start_date, "start_date", "Start Date"));
    errors.push(validDate(data.end_date, "end_date", "End Date"));
    errors.push(dateNotBefore(data.end_date, data.start_date, "end_date", "End Date", "Start Date"));
    return errors.filter(Boolean) as ValidationError[];
  },

  submittal: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.submittal_number, "submittal_number", "Submittal #"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(validDate(data.required_date, "required_date", "Required Date"));
    errors.push(validDate(data.returned_date, "returned_date", "Returned Date"));
    errors.push(validDate(data.approved_date, "approved_date", "Approved Date"));
    errors.push(maxLength(data.submittal_number, 50, "submittal_number", "Submittal #"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    if (data.round_number !== undefined && data.round_number !== null) {
      const rn = Number(data.round_number);
      if (isNaN(rn) || rn < 1) {
        errors.push({ field: "round_number", message: "Round must be 1 or greater.", rule: "POSITIVE_INTEGER" });
      }
    }
    return errors.filter(Boolean) as ValidationError[];
  },

  submittal_round: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.submittal_id, "submittal_id", "Submittal"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(validDate(data.returned_date, "returned_date", "Returned Date"));
    if (data.round_number !== undefined && data.round_number !== null) {
      const rn = Number(data.round_number);
      if (isNaN(rn) || rn < 1) {
        errors.push({ field: "round_number", message: "Round must be 1 or greater.", rule: "POSITIVE_INTEGER" });
      }
    }
    return errors.filter(Boolean) as ValidationError[];
  },

  action_item: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(validDate(data.due_date, "due_date", "Due Date"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    return errors.filter(Boolean) as ValidationError[];
  },

  inspection: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.inspection_type, "inspection_type", "Inspection Type"));
    errors.push(validDate(data.scheduled_date, "scheduled_date", "Scheduled Date"));
    errors.push(validDate(data.completed_date, "completed_date", "Completed Date"));
    errors.push(dateNotBefore(data.completed_date, data.scheduled_date, "completed_date", "Completed Date", "Scheduled Date"));
    return errors.filter(Boolean) as ValidationError[];
  },

  safety_incident: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.incident_type, "incident_type", "Incident Type"));
    errors.push(required(data.severity, "severity", "Severity"));
    errors.push(validDate(data.incident_date, "incident_date", "Incident Date"));
    errors.push(maxLength(data.description, 2000, "description", "Description"));
    return errors.filter(Boolean) as ValidationError[];
  },

  punchlist_item: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(validDate(data.due_date, "due_date", "Due Date"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    return errors.filter(Boolean) as ValidationError[];
  },

  project: (data) => {
    const errors: (ValidationError | null)[] = [];
    errors.push(required(data.project_number, "project_number", "Project Number"));
    errors.push(required(data.name, "name", "Project Name"));
    errors.push(required(data.client, "client", "Client"));
    errors.push(maxLength(data.name, 150, "name", "Project Name"));
    errors.push(maxLength(data.project_number, 50, "project_number", "Project Number"));
    if (data.original_contract_value !== undefined && data.original_contract_value !== null && data.original_contract_value !== "") {
      errors.push(nonNegativeNumber(data.original_contract_value, "original_contract_value", "Contract Value"));
    }
    if (data.retainage_percent !== undefined && data.retainage_percent !== null && data.retainage_percent !== "") {
      const ret = Number(data.retainage_percent);
      if (isNaN(ret) || ret < 0 || ret > 100) {
        errors.push({ field: "retainage_percent", message: "Retainage must be between 0% and 100%.", rule: "RANGE" });
      }
    }
    errors.push(validDate(data.start_date, "start_date", "Start Date"));
    errors.push(validDate(data.target_completion_date, "target_completion_date", "Target Completion Date"));
    errors.push(dateNotBefore(data.target_completion_date, data.start_date, "target_completion_date", "Target Completion", "Start Date"));
    return errors.filter(Boolean) as ValidationError[];
  },
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Validate an entity record. Returns an empty array when valid.
 */
export function validate(entity: string, data: RecordData, mode: ValidationMode = "create"): ValidationError[] {
  const ruleFn = RULES[entity];
  if (!ruleFn) {
    // H6 fix: fail closed — unknown entity types must not silently pass validation
    if (import.meta.env.DEV) console.error(`[validation] No rules defined for entity: "${entity}"`);
    return [{ field: "_entity", message: `Unknown entity type: "${entity}"`, rule: "entity_exists" }];
  }
  return ruleFn(data, mode);
}

/**
 * Returns true if the record passes all validation rules.
 */
export function isValid(entity: string, data: RecordData, mode: ValidationMode = "create"): boolean {
  return validate(entity, data, mode).length === 0;
}

/**
 * Returns all registered entity names with validation rules.
 */
export function getValidatedEntities(): string[] {
  return Object.keys(RULES);
}
