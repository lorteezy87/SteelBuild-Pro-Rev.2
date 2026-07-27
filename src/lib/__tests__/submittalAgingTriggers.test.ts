import { describe, expect, it } from "vitest";
import { computeCriticalAgingActions } from "../submittalAgingTriggers";

describe("computeCriticalAgingActions", () => {
  it("queues Critical R&R / OFS packages and skips IFC", () => {
    const actions = computeCriticalAgingActions(
      [
        {
          id: "s-rr",
          project_id: "p1",
          submittal_number: "SUB-001",
          title: "Anchor bolts",
          status: "Revise and Resubmit",
          ball_in_court: "Detailer",
          required_date: "2026-07-20",
        },
        {
          id: "s-ifc",
          project_id: "p1",
          submittal_number: "SUB-002",
          status: "Approved",
          ball_in_court: "GC",
          required_date: "2026-07-20",
        },
      ],
      "2026-07-25",
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      submittalId: "s-rr",
      stage: "R&R",
      priority: "High",
    });
    expect(actions[0].triggerKey).toContain("aging-critical");
  });

  it("returns empty when nothing is critical", () => {
    expect(
      computeCriticalAgingActions(
        [
          {
            id: "s1",
            project_id: "p1",
            status: "Approved as Noted",
            ball_in_court: "Detailer",
            required_date: "2026-08-20",
          },
        ],
        "2026-07-25",
      ),
    ).toEqual([]);
  });
});
