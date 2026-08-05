import { describe, it, expect } from "vitest";
import { buildControlBoardModel } from "../drawingControlCenter.derive";
import type { TriageItem } from "../types";

/**
 * Fixture factory for a triage item. Annotated `: any` on the override bag so
 * the noImplicitAny ratchet stays happy with partial fixtures (see
 * agent-memory wave2-page-extraction-ratchets). Returns a full TriageItem.
 */
function item(over: any = {}): TriageItem {
  return {
    id: over.id || "set-x",
    kind: over.kind || "Drawing Set",
    title: over.title || "Main Steel - IFC",
    group: over.group || "10 sheets - Submittal 3",
    status: over.status || "OFA",
    owner: over.owner || "Detailer",
    dueDate: "dueDate" in over ? over.dueDate : "2026-06-01",
    due: over.due || { label: "5d late", days: -5, overdue: false, dueSoon: false, tone: "x", sort: 0 },
    closed: false,
    needsAction: !!over.needsAction,
    routeTab: over.routeTab || "drawings",
    _submittalId: "sub1",
    _drawingSetId: "ds1",
    _firstSheetId: "sh1",
    _sheetIds: ["sh1"],
    ...over,
  };
}

const overdueItem = item({ id: "a", due: { label: "5d late", days: -5, overdue: true, dueSoon: false, tone: "x", sort: -5 } });
const dueSoonItem = item({ id: "b", due: { label: "in 2d", days: 2, overdue: false, dueSoon: true, tone: "y", sort: 2 } });
const needsActionItem = item({ id: "c", needsAction: true });
const noDateItem = item({ id: "d", dueDate: null, due: { label: "No date", days: null, overdue: false, dueSoon: false, tone: "z", sort: 999 } });

function makeTriage(over: any = {}): any {
  return {
    overdue: [overdueItem],
    dueSoon: [dueSoonItem],
    needsAction: [needsActionItem],
    noDate: [noDateItem],
    openItems: [overdueItem, dueSoonItem, needsActionItem, noDateItem],
    pipelineCounts: { OFA: 3, IFA: 2, BFA: 1 },
    overdueDrawingSets: 1,
    overdueUnlinkedSubmittals: 0,
    dueSoonDrawingSets: 1,
    noDateDrawingSets: 1,
    atRiskCount: 2,
    ...over,
  };
}

describe("buildControlBoardModel", () => {
  it("selects the focus item by urgency (overdue first)", () => {
    const model = buildControlBoardModel(makeTriage());
    expect(model.focusItem?.id).toBe("a");
  });

  it("falls back through dueSoon → needsAction → noDate when higher buckets are empty", () => {
    expect(buildControlBoardModel(makeTriage({ overdue: [] })).focusItem?.id).toBe("b");
    expect(buildControlBoardModel(makeTriage({ overdue: [], dueSoon: [] })).focusItem?.id).toBe("c");
    expect(
      buildControlBoardModel(makeTriage({ overdue: [], dueSoon: [], needsAction: [] })).focusItem?.id,
    ).toBe("d");
  });

  it("returns a null focus item + empty critical list when nothing is flagged", () => {
    const model = buildControlBoardModel(
      makeTriage({ overdue: [], dueSoon: [], needsAction: [], noDate: [], openItems: [] }),
    );
    expect(model.focusItem).toBeNull();
    expect(model.criticalItems).toEqual([]);
  });

  it("builds the critical queue from overdue + needsAction + dueSoon, deduped by id and capped at 12", () => {
    const model = buildControlBoardModel(makeTriage());
    const ids = model.criticalItems.map((i) => i.id);
    // a (overdue), c (needsAction), b (dueSoon) — all distinct, present.
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "c"]));
    // noDate item "d" is NOT part of the critical queue.
    expect(ids).not.toContain("d");
    expect(model.criticalItems.length).toBeLessThanOrEqual(12);
  });

  it("dedupes an item that appears in more than one critical bucket", () => {
    const shared = item({ id: "dup", needsAction: true, due: { label: "late", days: -1, overdue: true, dueSoon: false, tone: "x", sort: -1 } });
    const model = buildControlBoardModel(
      makeTriage({ overdue: [shared], needsAction: [shared], dueSoon: [] }),
    );
    expect(model.criticalItems.filter((i) => i.id === "dup")).toHaveLength(1);
  });

  it("caps the critical queue at 12 items", () => {
    const many = Array.from({ length: 20 }, (_, n) =>
      item({ id: `o${n}`, due: { label: "late", days: -n - 1, overdue: true, dueSoon: false, tone: "x", sort: -n - 1 } }),
    );
    const model = buildControlBoardModel(makeTriage({ overdue: many, needsAction: [], dueSoon: [] }));
    expect(model.criticalItems).toHaveLength(12);
  });

  it("returns the top pipeline statuses sorted by count, capped at 6", () => {
    const model = buildControlBoardModel(
      makeTriage({ pipelineCounts: { OFA: 3, IFA: 2, BFA: 1, IFC: 9, OFS: 4, Draft: 7, Extra: 1 } }),
    );
    expect(model.topStatuses).toHaveLength(6);
    // highest count first
    expect(model.topStatuses[0]).toEqual(["IFC", 9]);
    expect(model.topStatuses[1]).toEqual(["Draft", 7]);
  });

  it("caps dueSoon and noDate queues at 8", () => {
    const eleven = (prefix: string) =>
      Array.from({ length: 11 }, (_, n) => item({ id: `${prefix}${n}` }));
    const model = buildControlBoardModel(
      makeTriage({ dueSoon: eleven("s"), noDate: eleven("n") }),
    );
    expect(model.dueSoon.length).toBeLessThanOrEqual(8);
    expect(model.noDate.length).toBeLessThanOrEqual(8);
  });

  it("reports openCount from openItems.length", () => {
    const model = buildControlBoardModel(makeTriage());
    expect(model.openCount).toBe(4);
  });
});
