import { describe, it, expect } from "vitest";
import { adaptControlBoardFocus, buildControlBoardModel, buildProductionReadinessQueue, nextActionForTriageItem } from "../drawingControlCenter.derive";
import { buildSetPackages, buildTriage } from "../format";
import type { TriageItem, TriageModel } from "../types";

/** Fixture factory for a complete triage item from typed partial overrides. */
function item(over: Partial<TriageItem> = {}): TriageItem {
  return {
    id: over.id || "set-x",
    kind: over.kind || "Drawing Set",
    title: over.title || "Main Steel - IFC",
    group: over.group || "10 sheets - Submittal 3",
    status: over.status || "OFA",
    owner: over.owner || "Detailer",
    dueDate: "dueDate" in over ? (over.dueDate ?? null) : "2026-06-01",
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

function makeTriage(over: Partial<TriageModel> = {}): TriageModel {
  return {
    setItems: [overdueItem, dueSoonItem, needsActionItem, noDateItem],
    unlinkedSubmittalItems: [],
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
  it("names the actionable blocker without treating missing readiness as a release clearance", () => {
    expect(nextActionForTriageItem(item({ _readiness: { rfiBlocked: true } }))).toBe("Resolve linked RFI");
    expect(nextActionForTriageItem(item({ isRR: true }))).toBe("Resolve returned comments");
    expect(nextActionForTriageItem(item({ _needsUnlinkedHint: true }))).toBe("Create or relink submittal");
    expect(nextActionForTriageItem(item({ dueDate: null }))).toBe("Set due date");
    expect(nextActionForTriageItem(item({ _readiness: null }))).toBe("Open record and review evidence");
  });

  it("selects the focus item by urgency (overdue first)", () => {
    const model = buildControlBoardModel(makeTriage());
    expect(model.focusItem?.id).toBe("a");
  });

  describe("adaptControlBoardFocus", () => {
    it("keeps write availability in parity with the format validators", () => {
      const focus = adaptControlBoardFocus(item({
        _submittalId: null,
        _drawingSetId: "ds1",
        _firstSheetId: "sh1",
        _sheetIds: ["sh1"],
        _ownerScope: "First sheet owner",
        _canDraft: true,
        detailingState: "Not Started",
      }));

      expect(focus).toMatchObject({
        ownerLabel: "First sheet owner",
        canCreateSubmittal: true,
        writeAccess: {
          owner: true,
          dueDate: true,
          detailingState: true,
          readinessFlags: true,
        },
      });
    });

    it("does not expose writes or create actions without persisted targets", () => {
      const focus = adaptControlBoardFocus(item({
        kind: "Unlinked Submittal",
        _submittalId: null,
        _drawingSetId: null,
        _firstSheetId: null,
        _sheetIds: [],
        _ownerScope: "No owner target",
        _canDraft: false,
      }));

      expect(focus).toMatchObject({
        canCreateSubmittal: false,
        writeAccess: {
          owner: false,
          dueDate: false,
          detailingState: false,
          readinessFlags: false,
        },
      });
    });
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


describe("buildProductionReadinessQueue", () => {
  function queueForPackage({
    sheetFileUrl = "drawings/S101.pdf",
    submittal = { id: "approved", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"], submittal_type: "Shop Drawing" },
    holdsStatus = "ready" as "ready" | "loading" | "error",
    holds = [] as Array<{ drawing_id: string; is_active: boolean }>,
  } = {}) {
    const packages = buildSetPackages(
      [{ id: "sheet-1", drawing_set_id: "set-1", file_url: sheetFileUrl }] as any,
      [{ id: "set-1", set_name: "Main Steel" }] as any,
      [submittal] as any,
    );
    const readiness = new Map([[packages[0].key, { shopStageMarked: true }]]);
    const triage = buildTriage([submittal] as any, packages, readiness, false, { holdsStatus, holds });
    return buildProductionReadinessQueue(triage);
  }

  it("shows an active sheet hold as a blocker even when local readiness says ready", () => {
    const [row] = queueForPackage({ holds: [{ drawing_id: "sheet-1", is_active: true }] });
    expect(row.blocker).toContain("Active drawing hold");
    expect(row.blocker).not.toBe("Clear");
    expect(row).not.toHaveProperty("ready");
  });

  it("shows a missing drawing PDF as a blocker even when local readiness says ready", () => {
    const [row] = queueForPackage({ sheetFileUrl: "" });
    expect(row.blocker).toContain("PDF missing");
    expect(row).not.toHaveProperty("ready");
  });

  it("treats unavailable hold evidence as unknown, never as zero active holds", () => {
    const [row] = queueForPackage({ holdsStatus: "loading" });
    expect(row.blocker).toContain("Hold evidence unavailable");
    expect(row).not.toHaveProperty("ready");
  });

  it("requires a server gate check even when the known client evidence has no blockers", () => {
    const [row] = queueForPackage();
    expect(row.blocker).toContain("Server fab-release check required");
    expect(row).not.toHaveProperty("ready");
  });

  it("keeps a workflow-closed set in review when no server release verdict is present", () => {
    const closedSet = item({
      id: "closed-set",
      closed: true,
      _drawingSetId: "set-1",
      _readiness: { shopStageMarked: true },
      _releaseEvidence: {
        sheetCount: 1,
        supersededSheetCount: 0,
        missingPdfCount: 0,
        activeHoldCount: 0,
        governingStage: "Released",
      },
    });
    const [row] = buildProductionReadinessQueue(makeTriage({ setItems: [closedSet] }));
    expect(row.id).toBe("closed-set");
    expect(row.blocker).toBe("Server fab-release check required");
  });

  it("does not let a name-only legacy approval govern a set", () => {
    const [row] = queueForPackage({ submittal: {
      id: "legacy", status: "Approved", ball_in_court: "GC", drawing_set_ids: [], drawing_set_name: "Main Steel",
    } as any });
    expect(row.blocker).toContain("No set-ID-linked governing submittal");
    expect(row).not.toHaveProperty("ready");
  });

  it.each(["Product Data", null])("directs a linked %s record toward Shop Drawing classification or creation", (submittalType) => {
    const [row] = queueForPackage({ submittal: {
      id: "related", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"],
      submittal_type: submittalType,
    } as any });
    expect(row.blocker).toContain("No governing Shop Drawing submittal");
    expect(nextActionForTriageItem(row.item)).toBe("Verify linked submittal type or create/link Shop Drawing");
    expect(row).not.toHaveProperty("ready");
  });

  it("uses persisted readiness evidence and keeps missing schedule evidence unknown", () => {
    const triage = makeTriage({
      setItems: [
        item({
          id: "ready-1",
          title: "Area A Main Steel",
          detailingState: "BFA",
          _readiness: {
            backwardDates: {
              fabReleaseRequiredBy: "2026-09-24",
            },
            scheduleRisk: { atRisk: true, reasons: ["Not released for fab"], daysLate: 2 },
            rfiBlocked: true,
            revisionImpacted: false,
            materialImpacted: false,
            longLeadImpact: false,
            shopStageMarked: false,
          },
        }),
        item({
          id: "unknown-1",
          title: "Area B Misc Steel",
          detailingState: "OFA",
          _readiness: {
            backwardDates: {},
            scheduleRisk: { atRisk: false },
            rfiBlocked: false,
            revisionImpacted: false,
            materialImpacted: false,
            longLeadImpact: false,
            shopStageMarked: false,
          },
        }),
      ],
    });

    const rows = buildProductionReadinessQueue(triage);

    expect(rows[0]).toMatchObject({
      id: "ready-1",
      package: "Area A Main Steel",
      currentStage: "BFA",
      requiredIfc: "2026-09-24",
      fabStart: null,
      floatDays: null,
    });
    expect(rows[0].blocker).toMatch(/Open RFI/);

    const unknown = rows.find((row) => row.id === "unknown-1");
    expect(unknown?.requiredIfc).toBeNull();
    expect(unknown?.fabStart).toBeNull();
    expect(unknown?.floatDays).toBeNull();
  });

  it("summarizes concrete blockers without inventing a ready state", () => {
    const triage = makeTriage({
      setItems: [
        item({
          id: "blocked",
          detailingState: "IFC",
          _readiness: {
            backwardDates: { fabReleaseRequiredBy: "2026-09-20" },
            scheduleRisk: { atRisk: true, reasons: ["Not released for fab"] },
            rfiBlocked: false,
            revisionImpacted: true,
            materialImpacted: true,
            longLeadImpact: true,
            shopStageMarked: false,
          },
        }),
      ],
    });

    const [row] = buildProductionReadinessQueue(triage);
    expect(row.blocker).toContain("Revision");
    expect(row.blocker).toContain("Material");
    expect(row.blocker).toContain("Long lead");
    expect(row).not.toHaveProperty("ready");
  });
});
