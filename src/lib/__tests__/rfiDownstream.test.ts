import { describe, expect, it } from "vitest";
import { isAnswered, recommendedDownstreamActions } from "../rfiDownstream";

describe("isAnswered", () => {
  it("is true on answer text or Answered/Closed status, false otherwise", () => {
    expect(isAnswered({ answer: "Use A325 bolts" })).toBe(true);
    expect(isAnswered({ status: "Answered" })).toBe(true);
    expect(isAnswered({ status: "Closed" })).toBe(true);
    expect(isAnswered({ status: "Open" })).toBe(false);
    expect(isAnswered(null)).toBe(false);
  });
});

describe("recommendedDownstreamActions", () => {
  it("returns nothing for an unanswered RFI even if it has impact", () => {
    expect(recommendedDownstreamActions({ status: "Open", cost_impact: true })).toEqual([]);
  });

  it("always offers notify-field and constraint once answered", () => {
    const keys = recommendedDownstreamActions({ status: "Answered" }).map((a) => a.key);
    expect(keys).toContain("notify_field");
    expect(keys).toContain("add_constraint");
    expect(keys).not.toContain("create_co");
    expect(keys).not.toContain("update_drawing");
    expect(keys).not.toContain("open_wp");
  });

  it("offers a change order when cost impact or CO-likely is set", () => {
    const a = recommendedDownstreamActions({ status: "Answered", cost_impact: true });
    const co = a.find((x) => x.key === "create_co");
    expect(co).toBeTruthy();
    expect(co?.primary).toBe(true);
    const b = recommendedDownstreamActions({ status: "Answered", metadata: { change_order_likely: true } });
    expect(b.some((x) => x.key === "create_co")).toBe(true);
  });

  it("offers a drawing update on a revision flag or any drawing link; primary only when revision required", () => {
    const rev = recommendedDownstreamActions({ status: "Answered", metadata: { drawing_revision_required: true } });
    expect(rev.find((x) => x.key === "update_drawing")?.primary).toBe(true);

    const linked = recommendedDownstreamActions({ status: "Answered", drawing_reference: "S-2.3" });
    const d2 = linked.find((x) => x.key === "update_drawing");
    expect(d2).toBeTruthy();
    expect(d2?.primary).toBe(false);
    expect(d2?.hint).toContain("S-2.3");
  });

  it("offers the work package only when one is linked", () => {
    expect(recommendedDownstreamActions({ status: "Answered" }).some((x) => x.key === "open_wp")).toBe(false);
    const wp = recommendedDownstreamActions({ status: "Answered", work_package_id: "wp-1", metadata: { fab_hold: true } });
    const open = wp.find((x) => x.key === "open_wp");
    expect(open).toBeTruthy();
    expect(open?.hint).toMatch(/fab hold/i);
  });

  it("leads with the change order when present", () => {
    const a = recommendedDownstreamActions({ status: "Answered", cost_impact: true, drawing_reference: "S-1" });
    expect(a[0].key).toBe("create_co");
  });
});
