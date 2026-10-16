// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveFileUrl = vi.fn(async () => "https://signed.example/doc.pdf");
const getDocument = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  resolveFileUrl: (...args: unknown[]) =>
    (resolveFileUrl as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: (...args: unknown[]) =>
    (getDocument as (...a: unknown[]) => unknown)(...args),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { usePdfLoader } from "../usePdfLoader";

function mockDoc(numPages: number) {
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

  it('never exposes the old PDF or signed URL on the first render of a replacement source', async () => {
    const oldDoc = mockDoc(2);
    getDocument.mockReturnValue({ promise: Promise.resolve(oldDoc), destroy: vi.fn() });
    const observed: Array<{ source: string; doc: unknown; url: unknown }> = [];
    const { result, rerender } = renderHook(({ source }) => {
      const value = usePdfLoader({ activeDrawing: { id: 'same', file_url: source, pdf_page: 1 }, renderMode: 'canvas' });
      observed.push({ source, doc: value.pdfDoc, url: value.resolvedUrl });
      return value;
    }, { initialProps: { source: 'old.pdf' } });
    await waitFor(() => expect(result.current.pdfDoc).toBe(oldDoc));
    resolveFileUrl.mockImplementation(() => new Promise(() => {}));
    rerender({ source: 'new.pdf' });
    expect(observed.find(value => value.source === 'new.pdf')).toEqual({ source: 'new.pdf', doc: null, url: null });
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('ignores a late old PDF load %s after replacement', async outcome => {
    let finish!: (value: ReturnType<typeof mockDoc>) => void;
    let fail!: (error: Error) => void;
    const pending = new Promise<ReturnType<typeof mockDoc>>((resolve, reject) => { finish = resolve; fail = reject; });
    const fresh = mockDoc(4);
    resolveFileUrl.mockImplementation(async (source?: string) => `signed:${source}`);
    getDocument.mockReturnValueOnce({ promise: pending, destroy: vi.fn() }).mockReturnValue({ promise: Promise.resolve(fresh), destroy: vi.fn() });
    const { result, rerender } = renderHook(({ source }) => usePdfLoader({ activeDrawing: { id: 'same', file_url: source, pdf_page: 2 }, renderMode: 'canvas' }), { initialProps: { source: 'old.pdf' } });
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
    rerender({ source: 'new.pdf' });
    await waitFor(() => expect(result.current.pdfDoc).toBe(fresh));
    const old = mockDoc(2);
    await act(async () => { if (outcome === 'resolve') finish(old); else fail(new Error('old PDF rejected')); });
    expect(result.current.pdfDoc).toBe(fresh);
    expect(result.current.pdfError).toBeNull();
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
      (result.current.setPdfError as unknown as (msg: string) => void)("PDF render failed: Invalid page request.");
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
