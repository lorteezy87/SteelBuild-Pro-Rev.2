// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), flush: vi.fn(), create: vi.fn(), putPhoto: vi.fn(), deletePhoto: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ entities: { Photo: { filter: async (): Promise<never[]> => [], create: mocks.create }, PunchlistItem: { filter: async (): Promise<never[]> => [], create: mocks.create } } }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: () => ({ activeProject: { id: "project" } }) }));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "project" }));
vi.mock("@/hooks/useScheduleTasks", () => ({ useScheduleTasks: () => ({ scheduleTasks: [{ id: "task", percent_complete: 0 }], isPending: false }) }));
vi.mock("@/lib/field/OutboxContext", () => ({ useOutbox: () => ({ pending: 0, enqueue: mocks.enqueue, flush: mocks.flush, assertCaptureActive: () => {} }) }));
vi.mock("@/utils/compressImage", () => ({ compressImage: async (file: File) => file }));
vi.mock("@/lib/field/blobStore", () => ({ putPendingPhoto: mocks.putPhoto, deletePendingPhoto: mocks.deletePhoto, reconcilePendingPhotos: mocks.reconcile }));
vi.mock("@/pages/fieldToday/FieldTodayControlCenter", () => ({ default: ({ onSetProgress }: { onSetProgress: (task: object, pct: number) => void }) => <button onClick={() => onSetProgress({ id: "task", percent_complete: 0 }, 100)}>Complete task</button> }));
import FieldToday from "@/pages/FieldToday";
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.flush.mockResolvedValue(undefined); mocks.putPhoto.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); client.clear(); onlineManager.setOnline(true); vi.clearAllMocks(); });
function open() {
  return render(<QueryClientProvider client={client}><MemoryRouter><FieldToday /></MemoryRouter></QueryClientProvider>);
}
it("durably captures progress even when mutations would normally pause offline", async () => {
  onlineManager.setOnline(false);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
  await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ id: "task", pct: 100 }) })));
  expect(mocks.enqueue.mock.invocationCallOrder[0]).toBeLessThan(mocks.flush.mock.invocationCallOrder[0]);
});
it("persists photo bytes before queueing and never performs snapshot garbage collection", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Capture field photo"), { target: { files: [new File(["image"], "site.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "photo-create" })));
  expect(mocks.putPhoto.mock.invocationCallOrder[0]).toBeLessThan(mocks.enqueue.mock.invocationCallOrder[0]);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
it("removes only the new photo's bytes when the outbox write fails", async () => {
  mocks.enqueue.mockImplementationOnce(() => { throw new Error("Storage full"); });
  open();
  fireEvent.change(screen.getByLabelText("Capture field photo"), { target: { files: [new File(["image"], "site.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(mocks.deletePhoto).toHaveBeenCalledWith(mocks.putPhoto.mock.calls[0][0]));
});
it("rejects non-photo formats before placing them in the durable queue", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Capture field photo"), { target: { files: [new File(["<svg/>"], "site.svg", { type: "image/svg+xml" })] } });
  await waitFor(() => expect(mocks.deletePhoto).toHaveBeenCalled());
  expect(mocks.putPhoto).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
