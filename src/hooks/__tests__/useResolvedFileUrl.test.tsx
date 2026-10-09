// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";

const mocks = vi.hoisted(() => ({
  resolveFileUrl: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  resolveFileUrl: mocks.resolveFileUrl,
}));
vi.mock("@/lib/AuthContext", async () => ({ AuthContext: (await import("react")).createContext(undefined) }));

import { useResolvedFileUrl } from "../useResolvedFileUrl";
import { AuthContext } from "@/lib/AuthContext";
import { setActiveOrgId } from "@/lib/activeOrg";

let userId: string | null = "user-a";
const wrapper = ({ children }: { children: React.ReactNode }) => createElement(AuthContext.Provider, {
  value: { user: userId ? { id: userId } : null, isAuthenticated: !!userId } as never,
}, children);

const PREVIOUS_PATH = "project-a/uploads/previous.pdf";
const REPLACEMENT_PATH = "project-a/uploads/replacement.pdf";
const PREVIOUS_SIGNED_URL = "https://signed.example/previous.pdf";
const REPLACEMENT_SIGNED_URL = "https://signed.example/replacement.pdf";

describe("useResolvedFileUrl", () => {
  beforeEach(() => {
    mocks.resolveFileUrl.mockReset();
    userId = "user-a";
    setActiveOrgId("org-a");
  });
  afterEach(() => vi.useRealTimers());

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
      { initialProps: { fileUrl: PREVIOUS_PATH }, wrapper },
    );

    await waitFor(() => expect(result.current.url).toBe(PREVIOUS_SIGNED_URL));

    rerender({ fileUrl: REPLACEMENT_PATH });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.url).toBeNull();

    if (!resolveReplacement) throw new Error("replacement resolver was not started");
    resolveReplacement(REPLACEMENT_SIGNED_URL);

    await waitFor(() => expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL));
  });

  it("does not reuse a link after sign-out and a different account opens the same path", async () => {
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL).mockRejectedValueOnce(new Error("denied"));
    const { result, rerender } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH), { wrapper });
    await waitFor(() => expect(result.current.url).toBe(PREVIOUS_SIGNED_URL));
    userId = null;
    rerender();
    expect(result.current.url).toBeNull();
    userId = "user-b";
    rerender();
    expect(result.current.url).toBeNull();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
  });

  it("discards an outstanding signing response after workspace ownership changes", async () => {
    let finish: (value: string) => void = () => {};
    mocks.resolveFileUrl.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH), { wrapper });
    act(() => setActiveOrgId("org-b"));
    await act(async () => finish(PREVIOUS_SIGNED_URL));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.url).toBeNull();
  });

  it("reauthorizes before the signed link expires and removes it if access was revoked", async () => {
    vi.useFakeTimers();
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL).mockRejectedValueOnce(new Error("revoked"));
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH), { wrapper });
    await act(async () => {});
    expect(result.current.url).toBe(PREVIOUS_SIGNED_URL);
    await act(async () => { await vi.advanceTimersByTimeAsync(270_000); });
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
    expect(result.current.url).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
