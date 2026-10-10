// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRfiPageMutations } from "../useRfiPageMutations";

const mocks = vi.hoisted(() => ({ create: vi.fn(), number: vi.fn(), error: vi.fn(), guard: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { create: mocks.create } }, auth: {}, integrations: {},
}));
vi.mock("@/components/shared/numberSequencing", () => ({ getNextFormattedNumber: mocks.number }));
vi.mock("@/lib/rfiPieceHolds", () => ({ releaseHoldsForRfiMarks: vi.fn() }));
vi.mock("@/components/shared/crudFeedback", () => ({
  appendRecordToCaches: vi.fn(), replaceRecordInCaches: vi.fn(),
  removeRecordFromCaches: vi.fn(), invalidateCrudQueries: vi.fn(),
  toastCrudError: mocks.error,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockReset();
  mocks.number.mockResolvedValue("RFI #001");
  mocks.create.mockImplementation(async (record: Record<string, unknown>) => ({ id: "rfi-1", ...record }));
});

function mount(projectId: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(() => useRfiPageMutations({
    projectId,
    assertMutationScope: mocks.guard,
    projects: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
    projectMap: { a: "Alpha", b: "Beta" }, selectedRFI: null, editingRFI: null,
    setSelectedRFI: vi.fn(), setDeleteTarget: vi.fn(), setSelectedIds: vi.fn(),
    setShowBulkDelete: vi.fn(), setShowForm: vi.fn(), setEditingRFI: vi.fn(),
  }), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

it("rejects a mismatched project before consuming an official number", async () => {
  const { result } = mount("a");
  await act(async () => { await result.current.saveRfi({ title: "Connection query", project_id: "b" }); });
  expect(mocks.number).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/must match/) }), "Failed to save RFI");
});

it("uses the same selected portfolio project for allocation and persistence", async () => {
  const { result } = mount(undefined);
  await act(async () => { await result.current.saveRfi({ title: "Connection query", project_id: "b" }); });
  expect(mocks.number).toHaveBeenCalledWith(expect.objectContaining({ projectId: "b" }));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: "b", project_name: "Beta", rfi_number: "RFI #001" }));
});

it("uses the page project when the payload does not include one", async () => {
  const { result } = mount("a");
  await act(async () => { await result.current.saveRfi({ title: "Connection query" }); });
  expect(mocks.number).toHaveBeenCalledWith(expect.objectContaining({ projectId: "a" }));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: "a", project_name: "Alpha" }));
});

it("rejects a retained save before number allocation when workspace evidence is no longer current", async () => {
  const { result } = mount("a");
  const save = result.current.saveRfi;
  mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  await act(async () => { await save({ title: "Old workspace query" }); });
  expect(mocks.number).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rechecks scope after number allocation before writing the RFI", async () => {
  let resolve!: (value: string) => void;
  mocks.number.mockReturnValue(new Promise<string>(done => { resolve = done; }));
  const { result } = mount("a");
  let pending!: Promise<void>;
  act(() => { pending = result.current.saveRfi({ title: "Old workspace query" }); });
  mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  await act(async () => { resolve("RFI #001"); await pending; });
  expect(mocks.create).not.toHaveBeenCalled();
});
