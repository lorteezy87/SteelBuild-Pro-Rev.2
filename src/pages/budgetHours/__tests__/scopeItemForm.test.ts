/**
 * scopeItemForm.test.ts — pure form helpers for the Budget Hours scope-item
 * create/edit modal (ScopeItemFormModal). No React, no network.
 */

import { describe, it, expect } from "vitest";
import {
  toHours,
  validateScopeItem,
  buildScopeItemPatch,
  type ScopeItemFormValues,
} from "../ScopeItemFormModal";

const base: ScopeItemFormValues = {
  scope_item: "Main Steel — Columns",
  category: "Standard",
  is_specialty: false,
  shop_hours_budget: 100,
  shop_hours_actual: 40,
  field_hours_budget: 60,
  field_hours_actual: 10,
  notes: "  kickoff estimate ",
};

describe("toHours", () => {
  it("blank / whitespace → 0", () => {
    expect(toHours("")).toBe(0);
    expect(toHours("   ")).toBe(0);
  });
  it("parses positive numbers, including decimals", () => {
    expect(toHours("12")).toBe(12);
    expect(toHours("12.25")).toBe(12.25);
  });
  it("rejects negatives and non-numeric → 0", () => {
    expect(toHours("-5")).toBe(0);
    expect(toHours("abc")).toBe(0);
  });
});

describe("validateScopeItem", () => {
  it("requires a non-blank name", () => {
    expect(validateScopeItem({ scope_item: "" })).toMatch(/required/i);
    expect(validateScopeItem({ scope_item: "   " })).toMatch(/required/i);
  });
  it("passes with a real name", () => {
    expect(validateScopeItem({ scope_item: "Embeds" })).toBeNull();
  });
});

describe("buildScopeItemPatch", () => {
  it("trims name + notes and passes hours through", () => {
    const patch = buildScopeItemPatch({ ...base });
    expect(patch.scope_item).toBe("Main Steel — Columns");
    expect(patch.notes).toBe("kickoff estimate");
    expect(patch.shop_hours_budget).toBe(100);
    expect(patch.field_hours_actual).toBe(10);
  });
  it("empty notes normalize to null", () => {
    const patch = buildScopeItemPatch({ ...base, notes: "   " });
    expect(patch.notes).toBeNull();
  });
  it("Specialty category sets is_specialty true and normalizes category", () => {
    const patch = buildScopeItemPatch({ ...base, category: "Specialty", is_specialty: false });
    expect(patch.category).toBe("Specialty");
    expect(patch.is_specialty).toBe(true);
  });
  it("is_specialty flag alone still yields Specialty category", () => {
    const patch = buildScopeItemPatch({ ...base, category: "Standard", is_specialty: true });
    expect(patch.category).toBe("Specialty");
    expect(patch.is_specialty).toBe(true);
  });
  it("Standard category yields is_specialty false", () => {
    const patch = buildScopeItemPatch({ ...base, category: "Standard", is_specialty: false });
    expect(patch.category).toBe("Standard");
    expect(patch.is_specialty).toBe(false);
  });
});
