/**
 * validation.test.js — Tests for entity validation rules.
 *
 * Ensures no silent fallback can hide missing/invalid data.
 */

import { describe, it, expect } from "vitest";
import { validate, isValid } from "../validation";

// ─── Drawing validation ─────────────────────────────────────────────────

describe("Drawing validation", () => {
  const validDrawing = {
    project_id: "p1",
    sheet_number: "S-101",
    title: "Foundation Plan",
    drawing_set_name: "Structural Set A",
  };

  it("passes with all required fields", () => {
    expect(validate("drawing", validDrawing)).toEqual([]);
    expect(isValid("drawing", validDrawing)).toBe(true);
  });

  it("fails without project_id", () => {
    const errors = validate("drawing", { ...validDrawing, project_id: "" });
    expect(errors.some((e) => e.field === "project_id")).toBe(true);
  });

  it("fails without sheet_number", () => {
    const errors = validate("drawing", { ...validDrawing, sheet_number: "" });
    expect(errors.some((e) => e.field === "sheet_number")).toBe(true);
  });

  it("fails without drawing_set_name", () => {
    const errors = validate("drawing", { ...validDrawing, drawing_set_name: "" });
    expect(errors.some((e) => e.field === "drawing_set_name")).toBe(true);
  });

  it("fails with invalid due_date", () => {
    const errors = validate("drawing", { ...validDrawing, due_date: "not-a-date" });
    expect(errors.some((e) => e.field === "due_date")).toBe(true);
  });

  it("fails with overly long sheet_number", () => {
    const errors = validate("drawing", { ...validDrawing, sheet_number: "A".repeat(51) });
    expect(errors.some((e) => e.rule === "MAX_LENGTH")).toBe(true);
  });
});

// ─── Delivery validation ────────────────────────────────────────────────

describe("Delivery validation", () => {
  const validDelivery = {
    project_id: "p1",
    description: "Anchor Bolts Phase 1",
    vendor: "Fastenal",
    scheduled_date: "2026-05-01",
  };

  it("passes with all required fields", () => {
    expect(validate("delivery", validDelivery)).toEqual([]);
  });

  it("fails without description", () => {
    const errors = validate("delivery", { ...validDelivery, description: "" });
    expect(errors.some((e) => e.field === "description")).toBe(true);
  });

  it("fails without vendor", () => {
    const errors = validate("delivery", { ...validDelivery, vendor: "" });
    expect(errors.some((e) => e.field === "vendor")).toBe(true);
  });

  it("fails with negative weight", () => {
    const errors = validate("delivery", { ...validDelivery, weight_tons: -5 });
    expect(errors.some((e) => e.field === "weight_tons")).toBe(true);
  });
});

// ─── RFI validation ─────────────────────────────────────────────────────

describe("RFI validation", () => {
  const validRFI = {
    project_id: "p1",
    title: "Clarification on Beam Spec",
    ball_in_court: "Engineer",
  };

  it("passes with required fields", () => {
    expect(validate("rfi", validRFI)).toEqual([]);
  });

  it("fails without title", () => {
    const errors = validate("rfi", { ...validRFI, title: "" });
    expect(errors.some((e) => e.field === "title")).toBe(true);
  });

  it("fails without ball_in_court", () => {
    const errors = validate("rfi", { ...validRFI, ball_in_court: null });
    expect(errors.some((e) => e.field === "ball_in_court")).toBe(true);
  });
});

// ─── Change Order validation ────────────────────────────────────────────

describe("Change Order validation", () => {
  const validCO = {
    project_id: "p1",
    title: "Differing conditions",
    co_amount: 15000,
  };

  it("passes with required fields", () => {
    expect(validate("change_order", validCO)).toEqual([]);
  });

  it("fails with NaN amount", () => {
    const errors = validate("change_order", { ...validCO, co_amount: "abc" });
    expect(errors.some((e) => e.field === "co_amount")).toBe(true);
  });

  it("requires approved_by when status is Approved", () => {
    const errors = validate("change_order", { ...validCO, status: "Approved" });
    expect(errors.some((e) => e.field === "approved_by")).toBe(true);
    expect(errors.some((e) => e.field === "approved_date")).toBe(true);
  });
});

// ─── Expense validation ─────────────────────────────────────────────────

describe("Expense validation", () => {
  const validExpense = {
    project_id: "p1",
    amount: 2500,
    vendor: "Steel Supply Co",
    expense_type: "Material",
  };

  it("passes with required fields", () => {
    expect(validate("expense", validExpense)).toEqual([]);
  });

  it("fails with zero amount", () => {
    const errors = validate("expense", { ...validExpense, amount: 0 });
    expect(errors.some((e) => e.field === "amount")).toBe(true);
  });

  it("fails with negative amount", () => {
    const errors = validate("expense", { ...validExpense, amount: -100 });
    expect(errors.some((e) => e.field === "amount")).toBe(true);
  });
});

// ─── Work Package validation ────────────────────────────────────────────

describe("Work Package validation", () => {
  const validWP = {
    project_id: "p1",
    name: "Structural Steel",
    wp_number: "WP-001",
  };

  it("passes with required fields", () => {
    expect(validate("work_package", validWP)).toEqual([]);
  });

  it("fails when end_date is before start_date", () => {
    const errors = validate("work_package", {
      ...validWP,
      planned_start: "2026-06-01",
      planned_end: "2026-05-01",
    });
    expect(errors.some((e) => e.rule === "DATE_ORDER")).toBe(true);
  });
});

// ─── Schedule Task validation ───────────────────────────────────────────

describe("Schedule Task validation", () => {
  it("fails without task_name", () => {
    const errors = validate("schedule_task", { project_id: "p1" });
    expect(errors.some((e) => e.field === "task_name")).toBe(true);
  });

  it("passes with required fields", () => {
    expect(
      validate("schedule_task", {
        project_id: "p1",
        task_name: "Erect columns",
        start_date: "2026-06-01",
        end_date: "2026-06-15",
      })
    ).toEqual([]);
  });

  it("fails when end_date is before start_date", () => {
    const errors = validate("schedule_task", {
      project_id: "p1",
      task_name: "Erect columns",
      start_date: "2026-06-15",
      end_date: "2026-06-01",
    });
    expect(errors.some((e) => e.rule === "DATE_ORDER")).toBe(true);
  });
});

// ─── Action Item validation ────────────────────────────────────────────

describe("Action Item validation", () => {
  const validAI = {
    project_id: "p1",
    title: "Fix anchor bolts",
    due_date: "2026-06-01",
  };

  it("passes with required fields", () => {
    expect(validate("action_item", validAI)).toEqual([]);
    expect(isValid("action_item", validAI)).toBe(true);
  });

  it("fails without project_id", () => {
    const errors = validate("action_item", { ...validAI, project_id: "" });
    expect(errors.some((e) => e.field === "project_id")).toBe(true);
  });

  it("fails without title", () => {
    const errors = validate("action_item", { ...validAI, title: "" });
    expect(errors.some((e) => e.field === "title")).toBe(true);
  });

  it("fails with invalid due_date", () => {
    const errors = validate("action_item", { ...validAI, due_date: "nope" });
    expect(errors.some((e) => e.field === "due_date")).toBe(true);
  });

  it("fails with overly long title", () => {
    const errors = validate("action_item", { ...validAI, title: "X".repeat(201) });
    expect(errors.some((e) => e.rule === "MAX_LENGTH")).toBe(true);
  });
});

// ─── Inspection validation ─────────────────────────────────────────────

describe("Inspection validation", () => {
  const validInsp = {
    project_id: "p1",
    inspection_type: "Welds",
    scheduled_date: "2026-07-01",
  };

  it("passes with required fields", () => {
    expect(validate("inspection", validInsp)).toEqual([]);
  });

  it("fails without inspection_type", () => {
    const errors = validate("inspection", { ...validInsp, inspection_type: "" });
    expect(errors.some((e) => e.field === "inspection_type")).toBe(true);
  });

  it("fails when completed_date is before scheduled_date", () => {
    const errors = validate("inspection", {
      ...validInsp,
      completed_date: "2026-06-01",
    });
    expect(errors.some((e) => e.rule === "DATE_ORDER")).toBe(true);
    expect(errors.some((e) => e.field === "completed_date")).toBe(true);
  });

  it("passes when completed_date equals scheduled_date", () => {
    expect(
      validate("inspection", { ...validInsp, completed_date: "2026-07-01" })
    ).toEqual([]);
  });
});

// ─── Safety Incident validation ────────────────────────────────────────

describe("Safety Incident validation", () => {
  const validSI = {
    project_id: "p1",
    incident_type: "Near Miss",
    severity: "Low",
    incident_date: "2026-05-10",
  };

  it("passes with required fields", () => {
    expect(validate("safety_incident", validSI)).toEqual([]);
  });

  it("fails without incident_type", () => {
    const errors = validate("safety_incident", { ...validSI, incident_type: "" });
    expect(errors.some((e) => e.field === "incident_type")).toBe(true);
  });

  it("fails without severity", () => {
    const errors = validate("safety_incident", { ...validSI, severity: null });
    expect(errors.some((e) => e.field === "severity")).toBe(true);
  });

  it("fails with overly long description", () => {
    const errors = validate("safety_incident", {
      ...validSI,
      description: "A".repeat(2001),
    });
    expect(errors.some((e) => e.field === "description" && e.rule === "MAX_LENGTH")).toBe(true);
  });

  it("passes with description at max length", () => {
    expect(
      validate("safety_incident", { ...validSI, description: "A".repeat(2000) })
    ).toEqual([]);
  });
});

// ─── Punchlist Item validation ─────────────────────────────────────────

describe("Punchlist Item validation", () => {
  const validPL = {
    project_id: "p1",
    title: "Touch-up paint on Column B4",
    due_date: "2026-08-01",
  };

  it("passes with required fields", () => {
    expect(validate("punchlist_item", validPL)).toEqual([]);
  });

  it("fails without project_id", () => {
    const errors = validate("punchlist_item", { ...validPL, project_id: "" });
    expect(errors.some((e) => e.field === "project_id")).toBe(true);
  });

  it("fails without title", () => {
    const errors = validate("punchlist_item", { ...validPL, title: "" });
    expect(errors.some((e) => e.field === "title")).toBe(true);
  });

  it("fails with overly long title", () => {
    const errors = validate("punchlist_item", { ...validPL, title: "Z".repeat(201) });
    expect(errors.some((e) => e.rule === "MAX_LENGTH")).toBe(true);
  });

  it("fails with invalid due_date", () => {
    const errors = validate("punchlist_item", { ...validPL, due_date: "bad" });
    expect(errors.some((e) => e.field === "due_date")).toBe(true);
  });
});

// ─── Unknown entity ─────────────────────────────────────────────────────

describe("Unknown entity", () => {
  it("fails closed with an entity_exists error for an unknown entity", () => {
    // H6 fix: unknown entity types must not silently pass validation.
    const errors = validate("nonexistent", { foo: "bar" });
    expect(errors).toEqual([
      { field: "_entity", message: 'Unknown entity type: "nonexistent"', rule: "entity_exists" },
    ]);
  });
});
