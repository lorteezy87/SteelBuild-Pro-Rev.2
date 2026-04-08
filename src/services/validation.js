/**
 * validation.js — Entity-specific validation rules.
 *
 * ONE place to define what makes a record valid for create/update.
 * No silent fallbacks — every validation returns explicit errors.
 *
 * Usage:
 *   import { validate } from "@/services/validation";
 *   const errors = validate("drawing", formData, "create");
 *   if (errors.length) { errors.forEach(e => toast.error(e.message)); return; }
 */

// ─── Helpers ────────────────────────────────────────────────────────────

function required(value, field, label) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return { field, message: `${label} is required.`, rule: "REQUIRED" };
  }
  return null;
}

function positiveNumber(value, field, label) {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    return { field, message: `${label} must be a positive number.`, rule: "POSITIVE_NUMBER" };
  }
  return null;
}

function nonNegativeNumber(value, field, label) {
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    return { field, message: `${label} must not be negative.`, rule: "NON_NEGATIVE" };
  }
  return null;
}

function validDate(value, field, label) {
  if (!value) return null; // optional dates pass
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { field, message: `${label} is not a valid date.`, rule: "VALID_DATE" };
  }
  return null;
}

function dateNotBefore(value, beforeValue, field, label, beforeLabel) {
  if (!value || !beforeValue) return null;
  if (new Date(value) < new Date(beforeValue)) {
    return { field, message: `${label} must not be before ${beforeLabel}.`, rule: "DATE_ORDER" };
  }
  return null;
}

function maxLength(value, max, field, label) {
  if (typeof value === "string" && value.length > max) {
    return { field, message: `${label} must be ${max} characters or fewer.`, rule: "MAX_LENGTH" };
  }
  return null;
}

// ─── Entity rules ───────────────────────────────────────────────────────

const RULES = {

  drawing: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.sheet_number, "sheet_number", "Sheet Number"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(required(data.drawing_set_name, "drawing_set_name", "Drawing Set Name"));
    errors.push(validDate(data.due_date, "due_date", "Due Date"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(maxLength(data.sheet_number, 50, "sheet_number", "Sheet Number"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    errors.push(maxLength(data.drawing_set_name, 100, "drawing_set_name", "Drawing Set Name"));
    return errors.filter(Boolean);
  },

  delivery: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.delivery_title, "delivery_title", "Delivery Title"));
    errors.push(required(data.vendor, "vendor", "Vendor"));
    errors.push(required(data.scheduled_date, "scheduled_date", "Scheduled Date"));
    errors.push(validDate(data.scheduled_date, "scheduled_date", "Scheduled Date"));
    errors.push(validDate(data.required_date, "required_date", "Required Date"));
    errors.push(validDate(data.actual_date, "actual_date", "Actual Date"));
    errors.push(nonNegativeNumber(data.pieces || 0, "pieces", "Pieces"));
    errors.push(nonNegativeNumber(data.weight_tons || 0, "weight_tons", "Weight"));
    return errors.filter(Boolean);
  },

  rfi: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(required(data.ball_in_court, "ball_in_court", "Ball in Court"));
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(validDate(data.date_required, "date_required", "Date Required"));
    errors.push(maxLength(data.title, 200, "title", "Title"));
    return errors.filter(Boolean);
  },

  change_order: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.title, "title", "Title"));
    errors.push(required(data.co_amount, "co_amount", "CO Amount"));
    if (data.co_amount !== undefined && data.co_amount !== null) {
      const num = Number(data.co_amount);
      if (isNaN(num)) errors.push({ field: "co_amount", message: "CO Amount must be a number.", rule: "NUMBER" });
    }
    errors.push(validDate(data.submitted_date, "submitted_date", "Submitted Date"));
    errors.push(validDate(data.approved_date, "approved_date", "Approved Date"));
    if (data.status === "Approved") {
      errors.push(required(data.approved_by, "approved_by", "Approved By"));
      errors.push(required(data.approved_date, "approved_date", "Approved Date"));
    }
    return errors.filter(Boolean);
  },

  expense: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.amount, "amount", "Amount"));
    errors.push(positiveNumber(data.amount, "amount", "Amount"));
    errors.push(required(data.vendor, "vendor", "Vendor"));
    errors.push(required(data.expense_type, "expense_type", "Expense Type"));
    errors.push(validDate(data.expense_date, "expense_date", "Expense Date"));
    errors.push(validDate(data.invoice_date, "invoice_date", "Invoice Date"));
    errors.push(validDate(data.payment_date, "payment_date", "Payment Date"));
    return errors.filter(Boolean);
  },

  cost_code: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.cost_code_number, "cost_code_number", "Cost Code Number"));
    errors.push(required(data.description, "description", "Description"));
    errors.push(nonNegativeNumber(data.budget_amount || 0, "budget_amount", "Budget Amount"));
    return errors.filter(Boolean);
  },

  work_package: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.name, "name", "Name"));
    errors.push(required(data.wp_number, "wp_number", "WP Number"));
    errors.push(validDate(data.planned_start, "planned_start", "Planned Start"));
    errors.push(validDate(data.planned_end, "planned_end", "Planned End"));
    errors.push(dateNotBefore(data.planned_end, data.planned_start, "planned_end", "Planned End", "Planned Start"));
    return errors.filter(Boolean);
  },

  sov_item: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.description, "description", "Description"));
    errors.push(nonNegativeNumber(data.scheduled_value || 0, "scheduled_value", "Scheduled Value"));
    return errors.filter(Boolean);
  },

  schedule_task: (data, mode) => {
    const errors = [];
    errors.push(required(data.project_id, "project_id", "Project"));
    errors.push(required(data.task_name, "task_name", "Task Name"));
    errors.push(validDate(data.start_date, "start_date", "Start Date"));
    errors.push(validDate(data.end_date, "end_date", "End Date"));
    errors.push(dateNotBefore(data.end_date, data.start_date, "end_date", "End Date", "Start Date"));
    return errors.filter(Boolean);
  },
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Validate an entity record.
 *
 * @param {string} entity  – entity name (key in RULES)
 * @param {object} data    – form/record data
 * @param {string} mode    – "create" or "update"
 * @returns {Array<{field, message, rule}>} – empty array = valid
 */
export function validate(entity, data, mode = "create") {
  const ruleFn = RULES[entity];
  if (!ruleFn) {
    console.error(`[validation] No rules defined for entity: "${entity}"`);
    return [];
  }
  return ruleFn(data, mode);
}

/**
 * Returns true if the record passes all validation rules.
 */
export function isValid(entity, data, mode = "create") {
  return validate(entity, data, mode).length === 0;
}

/**
 * Returns all registered entity names with validation rules.
 */
export function getValidatedEntities() {
  return Object.keys(RULES);
}
