import { describe, expect, it } from "vitest";
import {
  buildCloseoutDbPayload,
  presentCloseoutForUi,
} from "../closeoutPayload";

describe("closeoutPayload", () => {
  it("maps UI create fields onto real project_closeout columns", () => {
    const payload = buildCloseoutDbPayload({
      closeout_status: "In Progress",
      completion_date: "2026-07-24",
      handover_date: "2026-08-01",
      final_inspection_completed: true,
      punch_list_cleared: true,
      warranties_registered: false,
      as_built_docs_completed: true,
      all_invoices_processed: true,
      permits_closed: false,
    });

    expect(payload).toMatchObject({
      status: "In Progress",
      closeout_date: "2026-07-24",
      punchlist_complete: true,
      warranties_complete: false,
      as_built_complete: true,
      final_inspection_date: expect.any(String),
      metadata: {
        handover_date: "2026-08-01",
        all_invoices_processed: true,
        permits_closed: false,
      },
    });
    expect(payload).not.toHaveProperty("closeout_status");
    expect(payload).not.toHaveProperty("final_inspection_completed");
  });

  it("presents DB rows in the checklist UI vocabulary", () => {
    const view = presentCloseoutForUi({
      status: "In Progress",
      closeout_date: "2026-07-01",
      punchlist_complete: true,
      warranties_complete: false,
      as_built_complete: true,
      final_inspection_date: "2026-07-02",
      metadata: {
        handover_date: "2026-07-10",
        all_invoices_processed: true,
        permits_closed: false,
      },
    });

    expect(view.closeout_status).toBe("In Progress");
    expect(view.completion_date).toBe("2026-07-01");
    expect(view.punch_list_cleared).toBe(true);
    expect(view.final_inspection_completed).toBe(true);
    expect(view.all_invoices_processed).toBe(true);
    expect(view.permits_closed).toBe(false);
    expect(view.handover_date).toBe("2026-07-10");
  });
});
