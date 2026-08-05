// @vitest-environment jsdom
//
// Regression test for the cost-code update-payload leak.
//
// CostControlCenter seeds this modal with an ENRICHED row from useFinancials
// (CostCodeRow), which adds derived display fields — expense_count,
// revised_budget, signed_extras, used_pct, is_over, … — that are NOT columns on
// the cost_codes table. The modal previously spread the whole seeded record into
// its save payload (`{ ...form }`), so those fields reached PostgREST and the
// update failed with:
//   "Could not find the 'expense_count' column of 'cost_codes' in the schema cache"
// The modal must emit ONLY real, user-editable cost_codes columns.

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import CostCodeFormModal from "@/components/financials/CostCodeFormModal";

// Mirrors a useFinancials CostCodeRow: real columns + derived display fields.
const ENRICHED_ROW = {
  id: "cc-1",
  project_id: "p1",
  project_name: "Old Name",
  cost_code_number: "01",
  description: "Wide Flange Beams",
  phase: "Materials",
  budget_amount: 10000,
  actual_cost: 4000,
  committed_cost: 6000,
  forecast_to_complete: 1000,
  notes: "watch this code",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  // ── derived display fields (NOT cost_codes columns) ──
  expense_count: 7,
  revised_budget: 12000,
  signed_extras: 2000,
  original_estimate: 10000,
  exposure: 6000,
  remaining_budget: 6000,
  used_pct: 50,
  is_over: false,
};

const DERIVED_KEYS = [
  "expense_count",
  "revised_budget",
  "signed_extras",
  "original_estimate",
  "exposure",
  "remaining_budget",
  "used_pct",
  "is_over",
];

describe("CostCodeFormModal — update payload", () => {
  it("emits only real cost_codes columns, never derived display fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <CostCodeFormModal
        open
        onClose={() => {}}
        onSave={onSave}
        costCode={ENRICHED_ROW}
        projects={[{ id: "p1", name: "Test Project" }]}
        existingCodes={[ENRICHED_ROW]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /update/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];

    // The regression: none of the derived display fields may reach the write.
    for (const key of DERIVED_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    // DB-managed columns must not be PATCHed back either.
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");

    // Real, user-editable columns are preserved.
    expect(payload).toMatchObject({
      project_id: "p1",
      cost_code_number: "01",
      budget_amount: 10000,
      actual_cost: 4000,
      committed_cost: 6000,
      forecast_to_complete: 1000,
      notes: "watch this code",
    });
    // project_name is resolved from the projects list, not the stale seed value.
    expect(payload.project_name).toBe("Test Project");
  });
});
