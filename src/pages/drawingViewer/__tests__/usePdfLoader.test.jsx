// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveFileUrl = vi.fn(async () => "https://signed.example/doc.pdf");
const getDocument = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  resolveFileUrl: (...args) => resolveFileUrl(...args),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: (...args) => getDocument(...args),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { usePdfLoader } from "../usePdfLoader";

function mockDoc(numPages) {
  return {
    numPages,
    destroy: vi.fn(async () => {}),
  };
}

describe("usePdfLoader", () => {
  beforeEach(() => {
    resolveFileUrl.mockReset();
    resolveFileUrl.mockResolvedValue("https://signed.example/doc.pdf");
    getDocument.mockReset();
  });

  it("clamps currentPage when the sheet pdf_page exceeds the PDF page count", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve(mockDoc(3)),
      destroy: vi.fn(),
    });

    const { result } = renderHook(() =>
      usePdfLoader({
        activeDrawing: { id: "d1", file_url: "projects/p/set.pdf", pdf_page: 18 },
        renderMode: "canvas",
      }),
    );

    await waitFor(() => expect(result.current.pdfDoc).toBeTruthy());
    expect(result.current.totalPages).toBe(3);
    expect(result.current.currentPage).toBe(3);
  });

  it("clears a sticky pdfError when switching sheets that share the same file_url", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve(mockDoc(2)),
      destroy: vi.fn(),
    });

    const { result, rerender } = renderHook(
      ({ drawing }) => usePdfLoader({ activeDrawing: drawing, renderMode: "canvas" }),
      {
        initialProps: {
          drawing: { id: "sheet-a", file_url: "projects/p/set.pdf", pdf_page: 1 },
        },
      },
    );

    await waitFor(() => expect(result.current.pdfDoc).toBeTruthy());

    act(() => {
      result.current.setPdfError("PDF render failed: Invalid page request.");
    });
    expect(result.current.pdfError).toMatch(/Invalid page request/);

    rerender({
      drawing: { id: "sheet-b", file_url: "projects/p/set.pdf", pdf_page: 2 },
    });

    await waitFor(() => {
      expect(result.current.pdfError).toBeNull();
      expect(result.current.currentPage).toBe(2);
    });
  });
});
