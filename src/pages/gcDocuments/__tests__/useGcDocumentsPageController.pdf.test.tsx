// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGcDocumentsPageController } from "../useGcDocumentsPageController";
import type { GcDocumentsPageData } from "../useGcDocumentsPageData";
import type { GcDocumentsPageState } from "../useGcDocumentsPageState";

const mocked = vi.hoisted(() => ({
  upload: vi.fn(),
  createSet: vi.fn(),
  createSheets: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

vi.mock("@/api/supabaseClient", () => ({
  integrations: { Core: { UploadFile: mocked.upload } },
  entities: {
    GcDrawingSet: { create: mocked.createSet },
    GcDrawing: { bulkCreate: mocked.createSheets },
  },
}));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntities: mocked.invalidate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useGcDocumentsPageController({
    projectId: "project-1",
    queryClient: client,
    data: { sheets: [] } as unknown as GcDocumentsPageData,
    state: {} as GcDocumentsPageState,
  }), { wrapper });
}

describe("reviewed GC PDF persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.upload.mockResolvedValue({ file_url: "org/uploads/gc.pdf", path: "org/uploads/gc.pdf" });
    mocked.createSet.mockResolvedValue({ id: "gc-set-1" });
    mocked.createSheets.mockResolvedValue([{ id: "gc-sheet-1", drawing_number: "S-101" }]);
  });

  it("stores the uploaded path on both issuance and reviewed source-page sheet", async () => {
    const { result } = setup();
    const file = new File(["%PDF-1.4"], "gc.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.createIssuance.mutateAsync({
        set: { set_name: "GC reissue", doc_type: "gc_drawing" },
        sheets: [{ drawing_number: "S-101", pdf_page: 2 }],
        file,
      });
    });
    expect(mocked.upload).toHaveBeenCalledWith({ file, workflow: "drawings" });
    expect(mocked.createSet).toHaveBeenCalledWith(expect.objectContaining({ file_url: "org/uploads/gc.pdf", project_id: "project-1" }));
    expect(mocked.createSheets).toHaveBeenCalledWith([expect.objectContaining({
      gc_drawing_set_id: "gc-set-1", file_url: "org/uploads/gc.pdf", pdf_page: 2, project_id: "project-1",
    })]);
  });

  it("reports a partial set id when sheets fail and refreshes the register", async () => {
    mocked.createSheets.mockRejectedValue(new Error("sheet insert denied"));
    const { result } = setup();
    const file = new File(["%PDF-1.4"], "gc.pdf", { type: "application/pdf" });
    await act(async () => {
      await expect(result.current.createIssuance.mutateAsync({
        set: { set_name: "GC reissue", doc_type: "gc_drawing" },
        sheets: [{ drawing_number: "S-101", pdf_page: 2 }],
        file,
      })).rejects.toMatchObject({ setId: "gc-set-1", uploadedPath: "org/uploads/gc.pdf" });
    });
    expect(mocked.invalidate).toHaveBeenCalled();
  });

  it("marks an ambiguous create outcome unsafe to retry after the PDF upload", async () => {
    mocked.createSet.mockRejectedValue(new Error("connection dropped after request"));
    const { result } = setup();
    const file = new File(["%PDF-1.4"], "gc.pdf", { type: "application/pdf" });
    await act(async () => {
      await expect(result.current.createIssuance.mutateAsync({
        set: { set_name: "GC reissue", doc_type: "gc_drawing" }, file,
      })).rejects.toMatchObject({ creationUncertain: true, uploadedPath: "org/uploads/gc.pdf" });
    });
    expect(mocked.createSheets).not.toHaveBeenCalled();
  });
});
