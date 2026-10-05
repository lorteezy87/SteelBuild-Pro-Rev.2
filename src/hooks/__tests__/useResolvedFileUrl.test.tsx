// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFileUrl: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  resolveFileUrl: mocks.resolveFileUrl,
}));

import { useResolvedFileUrl } from "../useResolvedFileUrl";

const PREVIOUS_PATH = "project-a/uploads/previous.pdf";
const REPLACEMENT_PATH = "project-a/uploads/replacement.pdf";
const PREVIOUS_SIGNED_URL = "https://signed.example/previous.pdf";
const REPLACEMENT_SIGNED_URL = "https://signed.example/replacement.pdf";

describe("useResolvedFileUrl", () => {
  beforeEach(() => {
    mocks.resolveFileUrl.mockReset();
  });

  it("clears the prior signed URL while a replacement path is still resolving", async () => {
    let resolveReplacement: ((value: string) => void) | undefined;
    mocks.resolveFileUrl.mockImplementation((fileUrl: string) => {
      if (fileUrl === PREVIOUS_PATH) return Promise.resolve(PREVIOUS_SIGNED_URL);
      return new Promise<string>((resolve) => {
        resolveReplacement = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ fileUrl }: { fileUrl: string }) => useResolvedFileUrl(fileUrl),
      { initialProps: { fileUrl: PREVIOUS_PATH } },
    );

    await waitFor(() => expect(result.current.url).toBe(PREVIOUS_SIGNED_URL));

    rerender({ fileUrl: REPLACEMENT_PATH });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.url).toBeNull();

    if (!resolveReplacement) throw new Error("replacement resolver was not started");
    resolveReplacement(REPLACEMENT_SIGNED_URL);

    await waitFor(() => expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL));
  });
});
