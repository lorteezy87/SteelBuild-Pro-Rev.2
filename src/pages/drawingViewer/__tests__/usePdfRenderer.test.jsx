// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePdfRenderer } from "../usePdfRenderer";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function viewport() {
  return {
    width: 100,
    height: 80,
    convertToViewportPoint: (x, y) => [x, y],
  };
}

describe("usePdfRenderer", () => {
  it("waits for cancellation before reusing the canvas", async () => {
    let canvasInUse = false;
    const renderCalls = [];

    const pdfDoc = {
      getPage: vi.fn(async (pageNumber) => ({
        getViewport: viewport,
        getAnnotations: vi.fn(async () => []),
        render: vi.fn(() => {
          if (canvasInUse) throw new Error("Cannot use the same canvas during multiple render() operations");
          canvasInUse = true;
          renderCalls.push(pageNumber);

          if (pageNumber === 1) {
            const pending = deferred();
            return {
              promise: pending.promise,
              cancel: () => queueMicrotask(() => {
                canvasInUse = false;
                pending.reject({ name: "RenderingCancelledException" });
              }),
            };
          }

          return {
            promise: Promise.resolve().then(() => { canvasInUse = false; }),
            cancel: vi.fn(),
          };
        }),
      })),
    };
    const onRenderError = vi.fn();

    const { result, rerender } = renderHook(
      (props) => usePdfRenderer(props),
      { initialProps: { pdfDoc: null, currentPage: 1, zoom: 1, rotation: 0, onRenderError } },
    );

    const canvas = document.createElement("canvas");
    canvas.getContext = vi.fn(() => ({}));
    act(() => { result.current.canvasRef.current = canvas; });

    rerender({ pdfDoc, currentPage: 1, zoom: 1, rotation: 0, onRenderError });
    await waitFor(() => expect(renderCalls).toEqual([1]));

    rerender({ pdfDoc, currentPage: 2, zoom: 1, rotation: 0, onRenderError });
    await waitFor(() => expect(renderCalls).toEqual([1, 2]));

    expect(onRenderError).toHaveBeenLastCalledWith(null);
    expect(onRenderError).not.toHaveBeenCalledWith(expect.stringContaining("same canvas"));
  });

  it("surfaces a render failure so the viewer can offer browser-PDF fallback", async () => {
    const onRenderError = vi.fn();
    const pdfDoc = {
      getPage: vi.fn(async () => ({
        getViewport: viewport,
        render: () => { throw new Error("render exploded"); },
      })),
    };

    const { result, rerender } = renderHook(
      (props) => usePdfRenderer(props),
      { initialProps: { pdfDoc: null, currentPage: 1, zoom: 1, rotation: 0, onRenderError } },
    );

    const canvas = document.createElement("canvas");
    canvas.getContext = vi.fn(() => ({}));
    act(() => { result.current.canvasRef.current = canvas; });

    rerender({ pdfDoc, currentPage: 1, zoom: 1, rotation: 0, onRenderError });

    await waitFor(() => {
      expect(onRenderError).toHaveBeenCalledWith("PDF render failed: render exploded");
    });
  });
});
