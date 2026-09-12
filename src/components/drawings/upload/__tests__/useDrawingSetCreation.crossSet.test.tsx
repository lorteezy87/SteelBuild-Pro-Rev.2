// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, renderHook, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  setFilter: vi.fn(),
  setCreate: vi.fn(),
  setUpdate: vi.fn(),
  drawingFilter: vi.fn(),
  bulkCreate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  revisionUpdate: vi.fn(),
  invalidateEntities: vi.fn(),
  autoCreate: vi.fn(),
  logActivity: vi.fn(),
  slip: vi.fn(),
  fetchSource: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingSet: { filter: m.setFilter, create: m.setCreate, update: m.setUpdate },
    Drawing: { filter: m.drawingFilter, bulkCreate: m.bulkCreate, create: m.create, update: m.update },
    DrawingRevision: { update: m.revisionUpdate },
  },
}));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntities: m.invalidateEntities }));
vi.mock("@/lib/autoScheduleDetailing", () => ({ autoCreateDetailingTasks: m.autoCreate }));
vi.mock("@/services/auditLogger", () => ({ logActivity: m.logActivity }));
vi.mock("@/lib/drawingHub", () => ({ recordSheetSlipSheet: m.slip }));
vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(),
  EMPTY_SET_META: {},
  parseFilename: vi.fn(),
  validatePdfPage: (page: unknown) => (typeof page === "number" && page > 0 ? page : null),
}));
vi.mock("@/lib/applyTitleblockRevisionOcr", () => ({ applyTitleblockRevisionOcr: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => ({ fetchCrossSetSource: m.fetchSource }));
vi.mock("sonner", () => ({ toast: m.toast }));

import { useDrawingSetCreation } from "../useDrawingSetCreation";

type Row = Record<string, unknown> & { id: string; sheet_number: string };

const L2 = { id: "set-l2", set_name: "Main Steel – L2", is_locked: false, is_deleted: false };
const L1 = { id: "set-l1", set_name: "Main Steel – L1", is_locked: false, is_deleted: false };
const NEW_SET = "Main Steel – L2 Rev A";
const oldRow = (id: string, sheetNumber: string, setId = "set-l2", setName = "Main Steel – L2"): Row => ({
  id, sheet_number: sheetNumber, title: `Framing ${sheetNumber}`, revision_number: "1", stage: "Released",
  drawing_set_id: setId, drawing_set_name: setName, is_superseded: false, is_deleted: false,
  metadata: { drawing_log: { row: sheetNumber } },
});
const uploadSheet = (sheetNumber: string, page: number) => ({
  sheetNumber, sheetTitle: `Framing ${sheetNumber}`, revision: "2", sourceFile: "rev-a.pdf",
  sourceFileUrl: "app-files/rev-a.pdf", pdfPage: page, selected: true,
});
const SHEETS = [uploadSheet("S-201", 1), uploadSheet("S-204", 2), uploadSheet("S-209", 3)];
const OLD_IDS = ["old-201", "old-204", "old-209"];

let rowsById: Record<string, Row> = {};

function makeState() {
  return {
    cancelledRef: { current: false },
    setProcessError: vi.fn(),
    setStep: vi.fn(),
    setProcessingStatus: vi.fn(),
    setCreatedCount: vi.fn(),
    setSupersedeResult: vi.fn(),
  };
}

function mount({ canSupersede = true, setName = NEW_SET } = {}) {
  const state = makeState();
  const qc = { invalidateQueries: vi.fn(async () => undefined) };
  const onComplete = vi.fn();
  const { result } = renderHook(() => useDrawingSetCreation({
    meta: { setName, revision: "A", discipline: "Structural", defaultStage: "Not Started", issueDate: "2026-09-11", issuedBy: "", notes: "" },
    activeProject: { id: "p1", name: "Proj" },
    fileResults: [{ fileName: "rev-a.pdf", pageCount: 3 }],
    uploadBatchId: "batch-1",
    onComplete,
    qc,
    state,
    canSupersede,
  }));
  return { handleCreate: result.current.handleCreate, state, qc, onComplete };
}

const lastSupersedeResult = (state: ReturnType<typeof makeState>) => state.setSupersedeResult.mock.calls.at(-1)?.[0];
const supersedeCalls = () => m.update.mock.calls.filter(([, patch]) => (patch as { metadata?: unknown }).metadata !== undefined);

beforeEach(() => {
  vi.clearAllMocks();
  const live = [oldRow("old-201", "S-201"), oldRow("old-204", "S-204"), oldRow("old-209", "S-209")];
  rowsById = Object.fromEntries(live.map((row) => [row.id, row]));
  m.setFilter.mockResolvedValue([]);
  m.setCreate.mockResolvedValue({ id: "set-new" });
  m.setUpdate.mockResolvedValue({});
  m.drawingFilter.mockResolvedValue([]);
  m.bulkCreate.mockImplementation(async (rows: Row[]) => rows.map((row) => ({ ...row, id: `new-${row.sheet_number}` })));
  m.create.mockImplementation(async (row: Row) => ({ ...row, id: `new-${row.sheet_number}` }));
  m.update.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ ...rowsById[id], id, ...patch }));
  m.invalidateEntities.mockResolvedValue(undefined);
  m.autoCreate.mockResolvedValue({ created: 0 });
  m.logActivity.mockResolvedValue(undefined);
  m.slip.mockResolvedValue({ skipped: false });
  m.fetchSource.mockImplementation(async () => ({ sets: [L2, { id: "set-new", set_name: NEW_SET }], drawings: Object.values(rowsById) }));
});

describe("useDrawingSetCreation — cross-set supersede", () => {
  it("supersedes the confirmed pages in the old set after the new rows are saved", async () => {
    const { handleCreate, state, qc, onComplete } = mount();
    await handleCreate(SHEETS, { supersedeIds: OLD_IDS });

    expect(m.bulkCreate).toHaveBeenCalledTimes(1);
    const calls = supersedeCalls();
    expect(calls.map(([id]) => id)).toEqual(OLD_IDS);
    for (const [id, patch] of calls) {
      expect(patch).toEqual({
        is_superseded: true,
        metadata: {
          drawing_log: rowsById[id as string].metadata && (rowsById[id as string].metadata as { drawing_log: unknown }).drawing_log,
          superseded_by: expect.objectContaining({
            drawing_id: `new-${rowsById[id as string].sheet_number}`,
            drawing_set_id: "set-new",
            drawing_set_name: NEW_SET,
            sheet_number: rowsById[id as string].sheet_number,
            upload_batch_id: "batch-1",
          }),
        },
      });
    }
    const insertedAt = m.bulkCreate.mock.invocationCallOrder[0];
    for (const order of m.update.mock.invocationCallOrder) expect(order).toBeGreaterThan(insertedAt);

    const result = lastSupersedeResult(state);
    expect(result.superseded.map((item: { sheetNumber: string }) => item.sheetNumber)).toEqual(["S-201", "S-204", "S-209"]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);

    expect(m.invalidateEntities).toHaveBeenCalledWith(qc, ["drawing", "drawingSet", "submittal", "drawing_revision"], "p1");
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["piece-register", "p1"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["canonical-release-gate"] });
    expect(m.logActivity).toHaveBeenCalledWith(
      "drawing",
      "updated",
      expect.objectContaining({ id: "set-l2", name: "Main Steel – L2" }),
      expect.objectContaining({ description: 'Superseded 3 pages in "Main Steel – L2" (S-201, S-204, S-209) — replaced by "Main Steel – L2 Rev A"' }),
    );
    expect(state.setStep).toHaveBeenLastCalledWith(5);
    expect(onComplete).toHaveBeenCalled();
  });

  it("leaves a page live when its replacement failed to save, and reports both", async () => {
    m.bulkCreate.mockRejectedValue(new Error("batch insert failed"));
    m.create.mockImplementation(async (row: Row) => {
      if (row.sheet_number === "S-204") throw new Error("insert refused");
      return { ...row, id: `new-${row.sheet_number}` };
    });
    const { handleCreate, state } = mount();
    await handleCreate(SHEETS, { supersedeIds: OLD_IDS });

    expect(m.update).not.toHaveBeenCalledWith("old-204", expect.anything());
    expect(supersedeCalls().map(([id]) => id)).toEqual(["old-201", "old-209"]);
    const result = lastSupersedeResult(state);
    expect(result.skipped).toEqual([
      expect.objectContaining({ id: "old-204", sheetNumber: "S-204", skipReason: "replacement_not_saved" }),
    ]);
    expect(result.superseded).toHaveLength(2);
    expect(state.setProcessError).toHaveBeenCalledWith("1 sheet(s) failed to save. 2 saved successfully.");
  });

  it("never supersedes another set's pages when the user can't write drawings", async () => {
    const { handleCreate, state, qc } = mount({ canSupersede: false });
    await handleCreate(SHEETS, { supersedeIds: OLD_IDS });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.fetchSource).not.toHaveBeenCalled();
    expect(state.setSupersedeResult).toHaveBeenLastCalledWith(null);
    expect(qc.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["canonical-release-gate"] });
    expect(state.setStep).toHaveBeenLastCalledWith(5);
  });

  it("uploading into an existing set: same-set rows go through the same-set replace, another set's page is superseded once", async () => {
    const l2Live = [oldRow("l2-201", "S-201"), oldRow("l2-300", "S-300")];
    const l1Page = oldRow("l1-205", "S-205", "set-l1", "Main Steel – L1");
    rowsById = Object.fromEntries([...l2Live, l1Page].map((row) => [row.id, row]));
    m.setFilter.mockImplementation(async (conditions: Record<string, unknown>) =>
      conditions.is_deleted ? [] : [{ id: "set-l2", set_name: "Main Steel – L2", metadata: {} }]);
    m.drawingFilter.mockResolvedValue(l2Live);
    m.fetchSource.mockImplementation(async () => ({ sets: [L2, L1], drawings: Object.values(rowsById) }));

    const { handleCreate, state } = mount({ setName: "Main Steel – L2" });
    // l2-201 is in the upload's own set: only the same-set replace may touch it.
    await handleCreate([uploadSheet("S-201", 1), uploadSheet("S-205", 2)], { supersedeIds: ["l1-205", "l2-201"] });

    const callsFor = (id: string) => m.update.mock.calls.filter(([calledId]) => calledId === id);
    expect(callsFor("l2-201")).toHaveLength(1);
    expect(callsFor("l2-201")[0][1]).toMatchObject({ is_superseded: false, drawing_set_id: "set-l2" });
    expect(callsFor("l2-300")).toEqual([["l2-300", { is_superseded: true }]]);
    expect(callsFor("l1-205")).toHaveLength(1);
    expect(callsFor("l1-205")[0][1]).toEqual({
      is_superseded: true,
      metadata: {
        drawing_log: { row: "S-205" },
        superseded_by: expect.objectContaining({ drawing_id: "new-S-205", drawing_set_id: "set-l2", drawing_set_name: "Main Steel – L2" }),
      },
    });
    const result = lastSupersedeResult(state);
    expect(result.superseded.map((item: { id: string }) => item.id)).toEqual(["l1-205"]);
    expect(result.skipped).toEqual([expect.objectContaining({ id: "l2-201", skipReason: "now_in_this_set" })]);
  });

  it("does not start the phase once the upload was cancelled", async () => {
    const { handleCreate, state } = mount();
    m.bulkCreate.mockImplementation(async (rows: Row[]) => {
      state.cancelledRef.current = true;
      return rows.map((row) => ({ ...row, id: `new-${row.sheet_number}` }));
    });
    await handleCreate(SHEETS, { supersedeIds: OLD_IDS });
    expect(m.fetchSource).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(state.setCreatedCount).not.toHaveBeenCalled();
  });

  it("finishes a started phase after a cancel, refreshes caches and reports it in a toast, one line per set", async () => {
    const l1Page = oldRow("l1-205", "S-205", "set-l1", "Main Steel – L1");
    rowsById[l1Page.id] = l1Page;
    m.fetchSource.mockImplementation(async () => ({ sets: [L2, L1, { id: "set-new", set_name: NEW_SET }], drawings: Object.values(rowsById) }));
    const { handleCreate, state, qc } = mount();
    m.update.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
      state.cancelledRef.current = true;
      return { ...rowsById[id], id, ...patch };
    });
    await handleCreate([...SHEETS, uploadSheet("S-205", 3)], { supersedeIds: [...OLD_IDS, "l1-205"] });
    expect(supersedeCalls().map(([id]) => id)).toEqual([...OLD_IDS, "l1-205"]);
    expect(m.invalidateEntities).toHaveBeenCalled();
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["canonical-release-gate"] });
    expect(m.toast.success).toHaveBeenCalledTimes(1);
    const toast = renderToast(m.toast.success.mock.calls[0][0]);
    expect(within(toast).getByText("Marked 3 pages superseded in Main Steel – L2: S-201, S-204, S-209.")).toBeInTheDocument();
    expect(within(toast).getByText("Marked 1 page superseded in Main Steel – L1: S-205.")).toBeInTheDocument();
    expect(state.setStep).not.toHaveBeenCalledWith(5);
  });

  it("puts each line of the post-cancel problems toast on its own line", async () => {
    const { handleCreate, state } = mount();
    m.update.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
      state.cancelledRef.current = true;
      if (id === "old-209") throw new Error("[drawings.update] DRAWING_SET_LOCKED: This drawing set is locked from edits.");
      return { ...rowsById[id], id, ...patch };
    });
    await handleCreate(SHEETS, { supersedeIds: OLD_IDS });
    expect(m.toast.warning).toHaveBeenCalledTimes(1);
    const [title, options] = m.toast.warning.mock.calls[0];
    expect(title).toBe("Upload finished with problems");
    const toast = renderToast((options as { description?: unknown }).description);
    // The page left live never reads as part of the superseded list.
    expect(within(toast).getByText("Marked 2 pages superseded in Main Steel – L2: S-201, S-204.")).toBeInTheDocument();
    expect(within(toast).getByText("S-209 (Main Steel – L2) is still live — Set is locked. Nothing was changed on it.")).toBeInTheDocument();
  });
});

/** Render what was handed to sonner, the way its title/description slot would. */
function renderToast(node: unknown): HTMLElement {
  return render(<div data-testid="toast">{node as ReactNode}</div>).getByTestId("toast");
}
