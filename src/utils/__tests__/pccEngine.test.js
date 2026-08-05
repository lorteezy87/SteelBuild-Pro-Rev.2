import { describe, expect, it } from "vitest";
import {
  buildPriorityFeed,
  buildReleaseGateActionDrafts,
  buildExecutionWindows,
  buildSignalKPIs,
  buildWaitingOnBoard,
  buildOwnerLoad,
  buildDailyBriefing,
  recommendNextAction,
  mapRFIsToPCCItems,
  mapDrawingsToPCCItems,
  mapSubmittalsToPCCItemsBasic,
  mapWorkPackagesToPCCItems,
  mapScheduleTasksToPCCItems,
  mapDeliveriesToPCCItems,
  mapChangeOrdersToPCCItems,
  mapActionItemsToPCCItems,
} from "../pccEngine";

// A local-calendar-day date string (YYYY-MM-DD) offset from *today*, matching
// the local-midnight basis the engine now uses everywhere. Anchored at runtime
// so the tests are stable regardless of the day/timezone they run in.
function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("buildReleaseGateActionDrafts", () => {
  it("creates human-approved action drafts for missing release confirmations", () => {
    const scored = buildPriorityFeed([
      {
        id: "wp-1",
        entityId: "1",
        type: "WorkPackage",
        title: "WP-003 Panels",
        subtitle: "Fabrication",
        status: "In Progress",
        target_date: "2026-05-13",
        assigned_to: "NL",
        project_id: "project-1",
        project_name: "Skyport",
        confirmations: {
          vif_confirmed: false,
          field_dimensions_confirmed: true,
          shop_drawing_revision_checked: false,
          e_sheet_checked: true,
          load_list_complete: true,
          sequence_aligned: true,
          site_ready: true,
        },
      },
    ]);

    const drafts = buildReleaseGateActionDrafts(scored);

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.metadata.confirmation_key)).toEqual([
      "vif_confirmed",
      "shop_drawing_revision_checked",
    ]);
    expect(drafts[0]).toMatchObject({
      project_id: "project-1",
      assigned_to: "NL",
      status: "Open",
      metadata: {
        created_from: "pcc_release_gate",
        source_type: "WorkPackage",
        source_id: "1",
      },
    });
  });

  it("does not duplicate drafts that already have matching action items", () => {
    const scored = buildPriorityFeed([
      {
        id: "del-7",
        entityId: "7",
        type: "Delivery",
        title: "Truck 4",
        target_date: "2026-05-14",
        project_id: "project-1",
        confirmations: {
          vif_confirmed: true,
          field_dimensions_confirmed: true,
          shop_drawing_revision_checked: true,
          e_sheet_checked: true,
          load_list_complete: false,
          sequence_aligned: true,
          site_ready: true,
        },
      },
    ]);

    const drafts = buildReleaseGateActionDrafts(scored, [
      { metadata: { pcc_release_gate_key: "Delivery:7:load_list_complete" } },
    ]);

    expect(drafts).toEqual([]);
  });
});

// P1 — one local-calendar-day basis for overdue/due-soon (no UTC/local mix,
// no wall-clock time-of-day drift).
describe("scoreItem date handling (local calendar day)", () => {
  it("treats a due-today item as due, not overdue", () => {
    const [scored] = buildPriorityFeed([
      { id: "x", type: "RFI", status: "Open", due_date: localDateStr(0) },
    ]);
    expect(scored.overdueDays).toBe(0);
    expect(scored.dueSoonDays).toBe(0);
  });

  it("counts whole days overdue for a past due date", () => {
    const [scored] = buildPriorityFeed([
      { id: "x", type: "RFI", status: "Open", due_date: localDateStr(-3) },
    ]);
    expect(scored.overdueDays).toBe(3);
    expect(scored.dueSoonDays).toBeNull();
  });

  it("computes dueSoonDays for a future due date", () => {
    const [scored] = buildPriorityFeed([
      { id: "x", type: "RFI", status: "Open", due_date: localDateStr(3) },
    ]);
    expect(scored.overdueDays).toBe(0);
    expect(scored.dueSoonDays).toBe(3);
  });

  it("returns 0/null when due_date is missing or unparseable", () => {
    const [a] = buildPriorityFeed([{ id: "a", type: "RFI", status: "Open" }]);
    expect(a.overdueDays).toBe(0);
    expect(a.dueSoonDays).toBeNull();
    const [b] = buildPriorityFeed([{ id: "b", type: "RFI", status: "Open", due_date: "not-a-date" }]);
    expect(b.overdueDays).toBe(0);
    expect(b.dueSoonDays).toBeNull();
  });

  it("puts a due-today item in the execution 'today' window", () => {
    const scored = buildPriorityFeed([
      { id: "t", type: "Delivery", status: "Scheduled", due_date: localDateStr(0), target_date: localDateStr(0) },
    ]);
    const windows = buildExecutionWindows(scored);
    expect(windows.today.map((i) => i.id)).toContain("t");
  });
});

// P2 — release-gate confirmation semantics are uniform: unset = missing (!!),
// and gates only apply to items that actually participate (>=1 field set).
describe("release-gate participation semantics", () => {
  it("does NOT gate a near-term WorkPackage with no gate fields tracked", () => {
    const [wp] = mapWorkPackagesToPCCItems([
      { id: "1", phase: "Fabrication", status: "In Progress", ship_date: localDateStr(5) },
    ]);
    expect(wp.confirmations).toBeNull();
    const [scored] = buildPriorityFeed([wp]);
    expect(scored.tags).not.toContain("RELEASE_GATE");
  });

  it("gates a WorkPackage once a field is set, surfacing unset fields as missing", () => {
    const [wp] = mapWorkPackagesToPCCItems([
      { id: "2", phase: "Fabrication", status: "In Progress", ship_date: localDateStr(5), vif_confirmed: true },
    ]);
    expect(wp.confirmations).not.toBeNull();
    expect(wp.confirmations.vif_confirmed).toBe(true);
    expect(wp.confirmations.site_ready).toBe(false);
    // vif and field_dimensions are independent gates now (no cross-OR masking).
    expect(wp.confirmations.field_dimensions_confirmed).toBe(false);
  });

  it("does NOT gate a delivery with no gate fields tracked", () => {
    const [del] = mapDeliveriesToPCCItems([
      { id: "9", status: "Scheduled", scheduled_date: localDateStr(5) },
    ]);
    expect(del.confirmations).toBeNull();
  });

  it("surfaces unset delivery gate fields as missing once one is set", () => {
    const [del] = mapDeliveriesToPCCItems([
      { id: "9", status: "Scheduled", scheduled_date: localDateStr(5), load_list_complete: true },
    ]);
    expect(del.confirmations).not.toBeNull();
    expect(del.confirmations.load_list_complete).toBe(true);
    expect(del.confirmations.vif_confirmed).toBe(false);
  });
});

// P2 — impact_area regex no longer misfires on document-name / substring hits.
describe("impact_area classification", () => {
  it("does NOT classify a shop-drawing submittal as Fabrication", () => {
    const [s] = mapSubmittalsToPCCItemsBasic([
      { id: "1", status: "Under Review", title: "Shop Drawings - Sequence 3" },
    ]);
    expect(s.impact_area).toBe("GC Approval");
  });

  it("suppresses shop-drawing across space / hyphen / slash separators", () => {
    const titles = ["Shop Drawings pkg", "Shop-Drawings pkg", "Shop/Dwg set"];
    for (const title of titles) {
      const [s] = mapSubmittalsToPCCItemsBasic([{ id: "1", status: "Under Review", title }]);
      expect(s.impact_area, title).toBe("GC Approval");
    }
  });

  it("still classifies a galvanizing submittal as Fabrication", () => {
    const [s] = mapSubmittalsToPCCItemsBasic([
      { id: "2", status: "Under Review", title: "Galv coating submittal" },
    ]);
    expect(s.impact_area).toBe("Fabrication");
  });

  it("classifies a real shop (not shop-drawing) submittal as Fabrication", () => {
    const [s] = mapSubmittalsToPCCItemsBasic([
      { id: "3", status: "Under Review", title: "Shop layout plan" },
    ]);
    expect(s.impact_area).toBe("Fabrication");
  });

  it("does NOT classify a coordination task as Cost", () => {
    const [t] = mapScheduleTasksToPCCItems([
      { id: "1", status: "In Progress", task_name: "Coordination meeting", phase: "Detailing" },
    ]);
    expect(t.impact_area).not.toBe("Cost");
  });

  it("classifies a change-order task as Cost", () => {
    const [t] = mapScheduleTasksToPCCItems([
      { id: "2", status: "In Progress", task_name: "CO pricing", phase: "" },
    ]);
    expect(t.impact_area).toBe("Cost");
  });
});

// P3 + schema alignment — change_orders field/status vocabulary.
describe("change order mapping and vocabulary", () => {
  it("reads the real co_amount column for exposure", () => {
    const [co] = mapChangeOrdersToPCCItems([{ id: "1", status: "Submitted", co_amount: 75000 }]);
    expect(co.amount).toBe(75000);
    const kpis = buildSignalKPIs(buildPriorityFeed([co]));
    expect(kpis.coExposure).toBe(75000);
  });

  it("recommends PRICE CO for Draft and FOLLOW UP for Submitted/Under Review", () => {
    expect(recommendNextAction({ type: "ChangeOrder", status: "Draft" })).toBe("PRICE CO");
    expect(recommendNextAction({ type: "ChangeOrder", status: "Submitted" })).toBe("FOLLOW UP");
    expect(recommendNextAction({ type: "ChangeOrder", status: "Under Review" })).toBe("FOLLOW UP");
  });

  it("scores a non-terminal CO as an unsigned-cost reason", () => {
    const [scored] = buildPriorityFeed([{ id: "c", type: "ChangeOrder", status: "Submitted", amount: 5000 }]);
    expect(scored.reasons).toContain("Unsigned CO");
  });
});

// P3 — status vocabulary alignment for schedule tasks & action items.
describe("status vocabulary alignment", () => {
  it("scores a Delayed schedule task as schedule risk", () => {
    const [scored] = buildPriorityFeed([
      { id: "t", type: "ScheduleTask", status: "Delayed", task_kind: "Task" },
    ]);
    expect(scored.tags).toContain("SCHEDULE_RISK");
    expect(scored.reasons).toContain("Blocked task");
  });

  it("treats a Resolved action item as terminal", () => {
    expect(mapActionItemsToPCCItems([{ id: "1", status: "Resolved", title: "done" }])).toEqual([]);
  });
});

// P3 — nextAction re-derivation passes real fields through.
describe("nextAction enrichment", () => {
  it("names the reviewer for an under-review submittal", () => {
    const [scored] = buildPriorityFeed([
      { id: "s", type: "Submittal", status: "Under Review", waiting_on: "Acme Architects" },
    ]);
    expect(scored.nextAction).toBe("Follow up with Acme Architects");
  });
});

// P3 — reasons are ranked by point contribution before truncation.
describe("reason ranking", () => {
  it("keeps the highest-contribution reason even when added late", () => {
    const [scored] = buildPriorityFeed([
      {
        id: "r",
        type: "RFI",
        status: "Open",
        due_date: localDateStr(2),
        impact_area: "GC Approval",
        affects_fabrication: true,
      },
    ]);
    expect(scored.reasons).toHaveLength(3);
    // "Affects fabrication" (+25) outranks "Due in 2d" (+18) and
    // "GC approval impact" (+15); "No owner assigned" (+10) is dropped.
    expect(scored.reasons[0]).toBe("Affects fabrication");
    expect(scored.reasons).not.toContain("No owner assigned");
  });
});

// P2 — every map*/build* tolerates null/undefined inputs.
describe("null-safety on entity lists", () => {
  it("map functions return [] for undefined/null inputs", () => {
    expect(mapRFIsToPCCItems(undefined)).toEqual([]);
    expect(mapDrawingsToPCCItems(null)).toEqual([]);
    expect(mapSubmittalsToPCCItemsBasic(undefined)).toEqual([]);
    expect(mapWorkPackagesToPCCItems(undefined)).toEqual([]);
    expect(mapScheduleTasksToPCCItems(undefined)).toEqual([]);
    expect(mapDeliveriesToPCCItems(undefined)).toEqual([]);
    expect(mapChangeOrdersToPCCItems(undefined)).toEqual([]);
    expect(mapActionItemsToPCCItems(undefined)).toEqual([]);
  });

  it("build functions tolerate undefined/null inputs", () => {
    expect(buildPriorityFeed(undefined)).toEqual([]);
    expect(buildSignalKPIs(undefined)).toMatchObject({ critical: 0, coExposure: 0 });
    expect(buildWaitingOnBoard(undefined)).toEqual([]);
    expect(buildExecutionWindows(undefined)).toMatchObject({ today: [], next48: [], next10: [], releaseGate: [] });
    expect(buildOwnerLoad(undefined)).toEqual([]);
    expect(buildDailyBriefing(undefined, undefined, undefined)).toMatchObject({ total: 0 });
  });
});
