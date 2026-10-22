import { describe, expect, it } from "vitest";
import { buildNeedsActionRows, buildStagePipeline, openRfisForBoard, pipelineLaneFor } from "../drawingControlCenter.derive";
import type { TriageItem, TriageModel } from "../types";

function item(over: Partial<TriageItem> & { id: string }): TriageItem {
  return {
    kind: "Drawing Set", title: over.id, group: "4 sheets", status: "OFA", owner: "Detailer",
    dueDate: "2026-06-01", due: { label: "in 9d", days: 9, overdue: false, dueSoon: false, tone: "x", sort: 9 },
    closed: false, needsAction: false, routeTab: "drawings", _submittalId: null, _drawingSetId: over.id,
    _firstSheetId: null, _sheetIds: [], ...over,
  };
}

const late = item({ id: "late", due: { label: "5d late", days: -5, overdue: true, dueSoon: false, tone: "x", sort: -5 } });
const soon = item({ id: "soon", due: { label: "in 2d", days: 2, overdue: false, dueSoon: true, tone: "x", sort: 2 } });
const act = item({ id: "act", needsAction: true });
const nodate = item({ id: "nodate", dueDate: null, due: { label: "No date", days: null, overdue: false, dueSoon: false, tone: "x", sort: 999 } });

function triage(over: Partial<TriageModel> = {}): TriageModel {
  return {
    setItems: [late, soon, act, nodate], unlinkedSubmittalItems: [],
    openItems: [nodate, soon, act, late, late], overdue: [late], dueSoon: [soon], needsAction: [act], noDate: [nodate],
    pipelineCounts: {}, overdueDrawingSets: 1, overdueUnlinkedSubmittals: 0, dueSoonDrawingSets: 1, noDateDrawingSets: 1, atRiskCount: 0,
    ...over,
  };
}

describe("buildNeedsActionRows", () => {
  it("lists every open item once, most urgent first, with no cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `x${i}` }));
    const rows = buildNeedsActionRows(triage({ openItems: [nodate, ...many, late, late] }));
    expect(rows[0].id).toBe("late");
    expect(rows).toHaveLength(32);
  });

  it("narrows to one queue and never lists a closed item", () => {
    expect(buildNeedsActionRows(triage(), "overdue").map((r) => r.id)).toEqual(["late"]);
    expect(buildNeedsActionRows(triage(), "noDate").map((r) => r.id)).toEqual(["nodate"]);
    const closed = item({ id: "done", closed: true });
    expect(buildNeedsActionRows(triage({ openItems: [closed, act] })).map((r) => r.id)).toEqual(["act"]);
  });
});

describe("buildStagePipeline", () => {
  it("maps drafting states to NS, R&R to BFA and every release state to REL", () => {
    expect(pipelineLaneFor("In Detailing")).toBe("NS");
    expect(pipelineLaneFor("R&R")).toBe("BFA");
    expect(pipelineLaneFor("Released for Erection")).toBe("REL");
    expect(pipelineLaneFor("Mystery")).toBeNull();
  });

  it("counts sets per lane, reports unknown states, and drops dead closed sets", () => {
    const p = buildStagePipeline([
      item({ id: "1", detailingState: "OFA" }),
      item({ id: "2", detailingState: "OFA" }),
      item({ id: "3", detailingState: "Released", closed: true }),
      item({ id: "4", detailingState: "Not Started", closed: true }),
      item({ id: "5", detailingState: "Weird" }),
    ]);
    expect(p.lanes.find((l) => l.lane === "OFA")?.count).toBe(2);
    expect(p.lanes.find((l) => l.lane === "REL")?.count).toBe(1);
    expect(p.lanes.find((l) => l.lane === "NS")?.count).toBe(0);
    expect(p.unclassified).toBe(1);
    expect(p.total).toBe(4);
  });
});

describe("openRfisForBoard", () => {
  it("keeps open RFIs only, earliest due first, flags overdue against the local day", () => {
    const { rows, total } = openRfisForBoard([
      { id: "a", rfi_number: "RFI-3", status: "Open", due_date: "2026-10-25" },
      { id: "b", rfi_number: "RFI-1", status: "Closed", due_date: "2026-10-01" },
      { id: "c", rfi_number: "RFI-2", status: "Open", due_date: "2026-10-18" },
      { id: "d", rfi_number: "RFI-4", status: "Answered" },
      { id: "e", rfi_number: "RFI-5", status: "Open" },
    ], "2026-10-19");
    expect(total).toBe(3);
    expect(rows.map((r) => [r.number, r.overdue])).toEqual([["RFI-2", true], ["RFI-3", false], ["RFI-5", false]]);
  });
});
