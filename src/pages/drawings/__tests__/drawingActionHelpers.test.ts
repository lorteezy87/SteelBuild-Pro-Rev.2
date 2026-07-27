import { describe, expect, it } from "vitest";
import {
  appendApprovalNotes,
  buildApprovalSetState,
  buildBulkDeleteConfirm,
  buildDeleteSetConfirm,
  buildDeleteSheetConfirm,
  buildMarkerSetState,
  buildParentApprovalPatch,
  buildRenameSetState,
  buildSheetApprovalPatch,
  buildSubmittalAdvanceSearch,
  formatBulkDeleteToast,
  formatBulkUpdateToast,
  formatRenameSetToast,
  formatSetApprovalToast,
  planAdvanceStage,
  planBulkStageApply,
  planDeleteSetMutation,
  resolveApprovalEffectiveDate,
  resolveApprovalParentSetId,
  resolveGroupSetId,
  resolveSheetsToApprove,
  toggleIdInSet,
  toggleSelectAllIds,
  toggleStageFilterValue,
} from "../drawingActionHelpers";

const STAGE_ORDER = ["Not Started", "IFA", "OFA", "BFA", "OFS", "IFC", "Released"];

describe("resolveGroupSetId", () => {
  it("prefers child FK, then setId, then parent.id", () => {
    expect(
      resolveGroupSetId({
        sheets: [{ id: "a", drawing_set_id: "from-child" }],
        setId: "from-set",
        parent: { id: "from-parent" },
      }),
    ).toBe("from-child");
    expect(resolveGroupSetId({ sheets: [], setId: "from-set", parent: { id: "p" } })).toBe("from-set");
    expect(resolveGroupSetId({ sheets: [], parent: { id: "p" } })).toBe("p");
  });
});

describe("buildDeleteSheetConfirm / buildDeleteSetConfirm / buildBulkDeleteConfirm", () => {
  it("labels sheet delete by sheet_number", () => {
    expect(buildDeleteSheetConfirm({ id: "1", sheet_number: "S-001" }).title).toBe('Delete "S-001"?');
    expect(buildDeleteSheetConfirm(null).title).toBe("Delete this sheet?");
  });

  it("returns null for ungrouped set delete", () => {
    expect(buildDeleteSetConfirm({ isUngrouped: true, name: "X", sheets: [] })).toBeNull();
  });

  it("builds set delete confirm with mutate args", () => {
    const plan = buildDeleteSetConfirm({
      name: "Set A",
      sheets: [
        { id: "1", drawing_set_id: "set-1" },
        { id: "2", drawing_set_id: "set-1" },
      ],
    });
    expect(plan?.title).toBe('Delete drawing set "Set A"?');
    expect(plan?.description).toContain("2 sheets");
    expect(plan?.mutateArgs).toEqual({ setId: "set-1", sheetIds: ["1", "2"], setName: "Set A" });
  });

  it("uses singular sheet copy and empty-set copy", () => {
    expect(
      buildDeleteSetConfirm({
        name: "One",
        sheets: [{ id: "1", drawing_set_id: "s" }],
      })?.description,
    ).toContain("1 sheet");
    expect(
      buildDeleteSetConfirm({ name: "Empty", sheets: [], setId: "s" })?.description,
    ).toMatch(/This drawing set will be removed/);
  });

  it("guards bulk delete confirm on empty selection", () => {
    expect(buildBulkDeleteConfirm(0)).toBeNull();
    expect(buildBulkDeleteConfirm(2)?.title).toBe("Delete 2 sheets?");
    expect(buildBulkDeleteConfirm(1)?.title).toBe("Delete 1 sheet?");
  });
});

describe("planAdvanceStage", () => {
  const validateOk = () => ({ ok: true as const });
  const classifyAllow = () => ({ allowed: true });

  it("errors on unknown stage", () => {
    expect(
      planAdvanceStage({ id: "1", stage: "Weird" }, STAGE_ORDER, {}, validateOk, classifyAllow),
    ).toEqual({
      kind: "error",
      message: 'Cannot advance sheet: unknown current stage "Weird"',
    });
  });

  it("infos when already at final stage", () => {
    expect(
      planAdvanceStage({ id: "1", stage: "Released" }, STAGE_ORDER, {}, validateOk, classifyAllow),
    ).toEqual({ kind: "info", message: "Already at final stage (IFC)" });
  });

  it("opens dialog for next stage", () => {
    const plan = planAdvanceStage(
      { id: "d1", stage: "IFA", drawing_set_id: "set-1" },
      STAGE_ORDER,
      {},
      validateOk,
      () => ({ allowed: false }),
    );
    expect(plan).toEqual({
      kind: "dialog",
      target: {
        drawingId: "d1",
        setId: "set-1",
        currentStage: "IFA",
        targetStage: "OFA",
        allowLegacy: false,
      },
    });
  });

  it("surfaces validate failure", () => {
    expect(
      planAdvanceStage(
        { id: "1", stage: "IFA" },
        STAGE_ORDER,
        {},
        () => ({ ok: false, reason: "nope" }),
        classifyAllow,
      ),
    ).toEqual({ kind: "error", message: "nope" });
  });
});

describe("planBulkStageApply", () => {
  it("noops without stage or selection", () => {
    expect(
      planBulkStageApply({
        bulkStage: "",
        selected: new Set(["a"]),
        drawings: [],
        stageOrder: STAGE_ORDER,
        submittalsBySetId: {},
        classify: () => ({ allowed: true }),
      }).kind,
    ).toBe("noop");
  });

  it("rejects unknown stage", () => {
    expect(
      planBulkStageApply({
        bulkStage: "Nope",
        selected: new Set(["a"]),
        drawings: [{ id: "a" }],
        stageOrder: STAGE_ORDER,
        submittalsBySetId: {},
        classify: () => ({ allowed: true }),
      }),
    ).toMatchObject({ kind: "error" });
  });

  it("aborts when every selected sheet has an open linked submittal", () => {
    const plan = planBulkStageApply({
      bulkStage: "IFA",
      selected: new Set(["a"]),
      drawings: [{ id: "a", drawing_set_id: "s1" }],
      stageOrder: STAGE_ORDER,
      submittalsBySetId: { s1: { total: 1, open: 1 } },
      classify: () => ({
        allowed: false,
        kind: "submittal",
        setId: "s1",
        latestStatus: "Under Review",
      }),
      resolveSetLabel: () => "Anchor Bolts",
    });
    expect(plan).toMatchObject({
      kind: "apply",
      ids: [],
      blockedIds: ["a"],
      blockedToast: { abort: true },
    });
    expect(plan.kind === "apply" && plan.blockedToast?.message).toMatch(/Anchor Bolts/);
  });

  it("allows closed-set sync while keeping open blockers selected", () => {
    const plan = planBulkStageApply({
      bulkStage: "IFA",
      selected: new Set(["a", "b"]),
      drawings: [
        { id: "a", drawing_set_id: "s1" },
        { id: "b", drawing_set_id: "s2" },
      ],
      stageOrder: STAGE_ORDER,
      submittalsBySetId: {},
      classify: (drawing) =>
        drawing.id === "a"
          ? { allowed: true, kind: "closed-set-sync", setId: "s1" }
          : {
              allowed: false,
              kind: "submittal",
              setId: "s2",
              latestStatus: "Submitted",
            },
    });
    expect(plan).toMatchObject({
      kind: "apply",
      ids: ["a"],
      blockedIds: ["b"],
      infoMessage: expect.stringMatching(/already closed/),
      blockedToast: { abort: false },
    });
  });

  it("returns apply plan with info message for legacy recovery", () => {
    const plan = planBulkStageApply({
      bulkStage: "IFA",
      selected: new Set(["a", "b"]),
      drawings: [{ id: "a" }, { id: "b" }],
      stageOrder: STAGE_ORDER,
      submittalsBySetId: {},
      classify: () => ({ allowed: true, kind: "legacy-recovery" }),
    });
    expect(plan).toMatchObject({
      kind: "apply",
      ids: ["a", "b"],
      blockedIds: [],
      infoMessage: expect.stringMatching(/without open linked/),
    });
  });
});

describe("approval / rename / marker builders", () => {
  const drawings = [
    { id: "1", drawing_set_id: "set-1", drawing_set_name: "Legacy" },
    { id: "2", drawing_set_id: null, drawing_set_name: "Loose" },
  ];

  it("buildApprovalSetState resolves by setId or legacy name", () => {
    expect(
      buildApprovalSetState({ setId: "set-1" }, drawings, { "set-1": { set_name: "Parent" } }),
    ).toEqual({
      setName: "Parent",
      setId: "set-1",
      sheets: [drawings[0]],
    });
    expect(buildApprovalSetState("Loose", drawings, {})?.setId).toBeNull();
    expect(buildApprovalSetState("Missing", drawings, {})).toBeNull();
  });

  it("buildRenameSetState / buildMarkerSetState guard ungrouped", () => {
    expect(buildRenameSetState({ isUngrouped: true, name: "X" })).toBeNull();
    expect(buildMarkerSetState({ isUngrouped: true }, "p")).toEqual({ kind: "noop" });
    expect(
      buildMarkerSetState({ name: "No parent", sheets: [{ id: "1" }] }, "p"),
    ).toMatchObject({ kind: "error" });
    expect(
      buildMarkerSetState(
        {
          name: "Set",
          setId: "set-1",
          parent: { file_url: "http://f", titleblock_title_rect: { x: 1 } },
          sheets: [{ id: "1", project_id: "p2" }],
        },
        "p1",
      ),
    ).toMatchObject({
      kind: "open",
      markerSet: { id: "set-1", set_name: "Set", project_id: "p1", file_url: "http://f" },
    });
  });

  it("approval patches and notes append", () => {
    expect(resolveApprovalEffectiveDate("2026-01-02")).toBe("2026-01-02");
    expect(resolveApprovalEffectiveDate(null, new Date("2026-07-26T15:00:00.000Z"))).toBe(
      "2026-07-26",
    );
    expect(appendApprovalNotes("old", "approved", "note")).toBe("old\n[APPROVED] note");
    expect(appendApprovalNotes(null, "approved", null)).toBeUndefined();
    expect(
      buildParentApprovalPatch({
        status: "approved",
        effectiveDate: "2026-01-01",
        approvedBy: "me",
        notes: "n",
        revision: "A",
      }),
    ).toEqual({
      set_approval_status: "approved",
      set_approved_date: "2026-01-01",
      set_approved_by: "me",
      set_approval_notes: "n",
      revision: "A",
    });
    expect(
      buildSheetApprovalPatch(
        { id: "1", notes: "prior" },
        { status: "approved", effectiveDate: "2026-01-01", revision: "B", notes: "ok" },
      ),
    ).toEqual({
      set_approval_status: "approved",
      set_approved_date: "2026-01-01",
      revision_number: "B",
      notes: "prior\n[APPROVED] ok",
    });
    expect(
      resolveApprovalParentSetId({
        sheets: [{ id: "1", drawing_set_id: "s1" }],
      }),
    ).toBe("s1");
    expect(
      resolveSheetsToApprove(
        { sheets: [{ id: "1" }, { id: "2" }] },
        false,
      ).map((s) => s.id),
    ).toEqual(["1"]);
  });
});

describe("toast formatters", () => {
  it("formats bulk update/delete/approval/rename", () => {
    expect(formatBulkUpdateToast(3, 1)).toEqual({
      level: "warning",
      message: "3 updated, 1 failed",
      clearSelection: false,
    });
    expect(formatBulkUpdateToast(2, 0, { fieldCount: 1 })).toMatchObject({
      level: "success",
      clearSelection: true,
    });
    expect(formatBulkDeleteToast(1, 0).message).toBe("Deleted 1 sheet");
    expect(formatSetApprovalToast("S", "approved", 2, 0).message).toBe(
      'Set "S" marked as approved',
    );
    expect(formatRenameSetToast("A", "B", 2).message).toContain("2 sheets failed");
    expect(formatRenameSetToast("A", "B").message).toBe('Renamed "A" → "B"');
  });
});

describe("selection + navigation helpers", () => {
  it("toggles ids and select-all preserves off-screen", () => {
    expect([...toggleIdInSet(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
    expect([...toggleIdInSet(new Set(["a", "b"]), "a")]).toEqual(["b"]);
    expect([...toggleSelectAllIds(new Set(["hidden"]), ["a", "b"])].sort()).toEqual([
      "a",
      "b",
      "hidden",
    ]);
    expect([...toggleSelectAllIds(new Set(["a", "b", "hidden"]), ["a", "b"])]).toEqual([
      "hidden",
    ]);
  });

  it("builds submittal advance search", () => {
    expect(buildSubmittalAdvanceSearch(null, null)).toBe("");
    expect(buildSubmittalAdvanceSearch("set-1", "In Review")).toBe(
      "?targetSetId=set-1&prefilledStatus=In+Review",
    );
  });
});

describe("planDeleteSetMutation", () => {
  it("chooses parentOnly / cascade / legacyChildren", () => {
    expect(planDeleteSetMutation({ setId: "s", sheetIds: [] })).toEqual({
      kind: "parentOnly",
      setId: "s",
    });
    expect(planDeleteSetMutation({ setId: "s", sheetIds: ["1"] })).toEqual({
      kind: "cascade",
      setId: "s",
      sheetCount: 1,
    });
    expect(planDeleteSetMutation({ setId: null, sheetIds: ["1", "2"] })).toEqual({
      kind: "legacyChildren",
      sheetIds: ["1", "2"],
    });
  });
});

describe("toggleStageFilterValue", () => {
  it("flips active KPI filter back to ALL", () => {
    expect(toggleStageFilterValue("_overdue", "_overdue")).toBe("ALL");
    expect(toggleStageFilterValue("ALL", "_priority")).toBe("_priority");
  });
});
