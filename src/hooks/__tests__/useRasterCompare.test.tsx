// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rasterizePage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pdfRasterize", () => ({ rasterizePage }));

import { useRasterCompare } from "@/hooks/useRasterCompare";

const oldPage = { fileUrl: "https://example.test/old.pdf", pdfPage: 1 };
const newPage = { fileUrl: "https://example.test/new.pdf", pdfPage: 1 };
const raster = { width: 20, height: 20 } as HTMLCanvasElement;

describe("useRasterCompare", () => {
  beforeEach(() => rasterizePage.mockReset());

  it("retries a failed raster pair and clears error only after both rasters render", async () => {
    rasterizePage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(raster);

    const { result } = renderHook(() => useRasterCompare({ open: true, oldPage, newPage }));

    await waitFor(() => expect(result.current.renderError).toMatch(/network/));
    expect(result.current.rastersReady).toBe(false);

    act(() => result.current.retryRender());

    await waitFor(() => expect(result.current.rastersReady).toBe(true));
    expect(result.current.renderError).toBe("");
    expect(rasterizePage).toHaveBeenCalledTimes(4);
  });
});
