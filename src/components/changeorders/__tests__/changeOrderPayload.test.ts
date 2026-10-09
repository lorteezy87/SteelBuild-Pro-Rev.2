import { describe, expect, it } from "vitest";
import { buildChangeOrderPayload } from "../changeOrderPayload";

describe("buildChangeOrderPayload", () => {
  it("keeps editable fields and strips aliases, ids, timestamps, and derived values", () => {
    const payload = buildChangeOrderPayload({
      id: "co-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      project_id: "p-1",
      project_name: "Project One",
      co_number: "CO #004",
      title: "Added steel",
      description: "Added support steel",
      reason_code: "Design Change",
      status: "Submitted",
      co_amount: "12450.25",
      margin_percent: "12.5",
      schedule_impact_days: "3",
      source_rfi_id: "",
      sov_line_item_id: "",
      sov_line_number: undefined,
      revised_contract_value: 999999,
      days_open: 42,
    });

    expect(payload).toMatchObject({
      project_id: "p-1",
      project_name: "Project One",
      title: "Added steel",
      co_amount: 12450.25,
      margin_percent: 12.5,
      schedule_impact_days: 3,
      source_rfi_id: null,
      sov_line_item_id: null,
      sov_line_number: null,
    });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");
    expect(payload).not.toHaveProperty("revised_contract_value");
    expect(payload).not.toHaveProperty("days_open");
    expect(payload).not.toHaveProperty("co_number");
  });

  it.each([Infinity, -Infinity, "not-a-number"])("rejects a non-finite CO amount: %s", co_amount => {
    expect(() => buildChangeOrderPayload({ co_amount, margin_percent: 0, schedule_impact_days: 0 })).toThrow(/amount/i);
  });

  it.each([-1, 1.5, Infinity, 2147483648])("rejects invalid schedule impact: %s", schedule_impact_days => {
    expect(() => buildChangeOrderPayload({ co_amount: 0, margin_percent: 0, schedule_impact_days })).toThrow(/schedule/i);
  });

  it("keeps finite deducts and zeroes, and requires a valid margin", () => {
    expect(buildChangeOrderPayload({ co_amount: "-2500.25", margin_percent: "0", schedule_impact_days: "0" })).toMatchObject({ co_amount: -2500.25, margin_percent: 0, schedule_impact_days: 0 });
    expect(() => buildChangeOrderPayload({ co_amount: 2, margin_percent: Infinity })).toThrow(/margin/i);
    expect(() => buildChangeOrderPayload({ co_amount: 2, margin_percent: 101 })).toThrow(/margin/i);
  });

  it("carries explicit approval decisions and trims their approver", () => {
    expect(buildChangeOrderPayload({ status: "Approved", co_amount: "500", approved_by: "  Casey PM  ", approved_date: "2026-10-07", sov_mode: "adjust_line", sov_line_item_id: "sov-1" }, { existing: { status: "Submitted" } })).toMatchObject({ status: "Approved", approved_by: "Casey PM", approved_date: "2026-10-07", sov_mode: "adjust_line", sov_line_item_id: "sov-1" });
  });

  it("rejects approval without permission, an explicit treatment, or a real calendar date", () => {
    const form = { status: "Approved", co_amount: 500, approved_by: "Casey", approved_date: "2026-10-07", sov_mode: "none" };
    const existing = { status: "Submitted" };
    expect(() => buildChangeOrderPayload(form, { existing, canApprove: false })).toThrow(/permission/i);
    expect(() => buildChangeOrderPayload({ ...form, sov_mode: "" }, { existing })).toThrow(/SOV/i);
    expect(() => buildChangeOrderPayload({ ...form, approved_date: "2026-02-30" }, { existing })).toThrow(/date/i);
  });

  it("does not resend immutable fields or approval stamps when editing an approved record", () => {
    const payload = buildChangeOrderPayload({ status: "Approved", title: "Revised description", co_number: "CO #001", co_amount: 900, cost_code_id: "cc-1", approved_by: "Casey", approved_date: "2026-10-07", sov_mode: "adjust_line", sov_line_item_id: "sov-1", sov_line_number: 4 }, { existing: { status: "Approved" } });
    expect(payload).toMatchObject({ status: "Approved", title: "Revised description" });
    for (const field of ["co_number", "co_amount", "cost_code_id", "approved_by", "approved_date", "sov_mode", "sov_line_item_id", "sov_line_number"]) expect(payload).not.toHaveProperty(field);
  });

  it("requires and retains rejection and void reasons while omitting stale approval metadata", () => {
    const existing = { status: "Submitted" };
    expect(() => buildChangeOrderPayload({ status: "Rejected", decision_notes: "  " }, { existing })).toThrow(/reason/i);
    expect(buildChangeOrderPayload({ status: "Rejected", decision_notes: "  Missing steel scope  ", approved_by: "stale", approved_date: "2026-10-07", sov_mode: "new_line" }, { existing })).toMatchObject({ decision_notes: "Missing steel scope" });
    const voided = buildChangeOrderPayload({ status: "Void", void_reason: "  Duplicate change  ", approved_by: "stale" }, { existing });
    expect(voided).toMatchObject({ void_reason: "Duplicate change" });
    expect(voided).not.toHaveProperty("approved_by");
  });

  it("rejects voiding without permission before returning any editable payload", () => {
    expect(() => buildChangeOrderPayload({ status: "Void", void_reason: "Duplicate", title: "Changed" }, { existing: { status: "Submitted" }, canVoid: false })).toThrow(/permission.*void/i);
  });
});
