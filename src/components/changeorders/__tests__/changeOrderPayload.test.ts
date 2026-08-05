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
      status: "Under Review",
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
      co_number: "CO #004",
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
  });
});
