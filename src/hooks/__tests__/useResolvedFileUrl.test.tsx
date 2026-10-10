// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/activeOrg";

const mocks = vi.hoisted(() => ({
  resolveFileUrl: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  resolveFileUrl: mocks.resolveFileUrl,
}));

import { useResolvedFileUrl } from "../useResolvedFileUrl";

let PREVIOUS_PATH = "project-a/uploads/previous.pdf";
let fixtureSequence = 0;
const REPLACEMENT_PATH = "project-a/uploads/replacement.pdf";
const PREVIOUS_SIGNED_URL = "https://signed.example/previous.pdf";
const REPLACEMENT_SIGNED_URL = "https://signed.example/replacement.pdf";

describe("useResolvedFileUrl", () => {
  beforeEach(() => {
    mocks.resolveFileUrl.mockReset().mockResolvedValue(null);
    PREVIOUS_PATH = `project-a/uploads/previous-${++fixtureSequence}.pdf`;
    setActiveOrgId(null);
    setActiveOrgId("workspace-a");
  });

  afterEach(() => {
    cleanup();
    setActiveOrgId(null);
    vi.useRealTimers();
  });

  it("does not resolve a private file without an active workspace", async () => {
    setActiveOrgId(null);
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await act(async () => {});
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocks.resolveFileUrl).not.toHaveBeenCalled();
  });

  it("reuses a current link within the same workspace", async () => {
    mocks.resolveFileUrl.mockResolvedValue(PREVIOUS_SIGNED_URL);
    const first = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await waitFor(() => expect(first.result.current.url).toBe(PREVIOUS_SIGNED_URL));
    first.unmount();
    const second = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await waitFor(() => expect(second.result.current.url).toBe(PREVIOUS_SIGNED_URL));
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(1);
  });

  it("clears a displayed link and reauthorizes the same path after a workspace change", async () => {
    let completeSecond: ((value: string) => void) | undefined;
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL)
      .mockImplementationOnce(() => new Promise<string>((resolve) => { completeSecond = resolve; }));
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await waitFor(() => expect(result.current.url).toBe(PREVIOUS_SIGNED_URL));
    act(() => setActiveOrgId("workspace-b"));
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
    await act(async () => completeSecond?.(REPLACEMENT_SIGNED_URL));
    expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL);
  });

  it("rejects a late result across a cleared-and-reopened workspace", async () => {
    let completeOld: ((value: string) => void) | undefined;
    let completeNew: ((value: string) => void) | undefined;
    mocks.resolveFileUrl
      .mockImplementationOnce(() => new Promise<string>((resolve) => { completeOld = resolve; }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { completeNew = resolve; }));
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    act(() => { setActiveOrgId(null); setActiveOrgId("workspace-a"); });
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
    await act(async () => completeOld?.(PREVIOUS_SIGNED_URL));
    expect(result.current.url).toBeNull();
    await act(async () => completeNew?.(REPLACEMENT_SIGNED_URL));
    expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL);
  });

  it("removes the displayed link when the user signs out", async () => {
    mocks.resolveFileUrl.mockResolvedValue(PREVIOUS_SIGNED_URL);
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await waitFor(() => expect(result.current.url).toBe(PREVIOUS_SIGNED_URL));
    act(() => setActiveOrgId(null));
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(1);
  });

  it("refreshes a mounted private link after five minutes and hides it if access is denied", async () => {
    vi.useFakeTimers();
    const denied = new Error("Access denied");
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL).mockRejectedValueOnce(denied);
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await act(async () => {});
    expect(result.current.url).toBe(PREVIOUS_SIGNED_URL);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
    expect(result.current.url).toBeNull();
    expect(result.current.error).toBe(denied);
    expect(result.current.loading).toBe(false);
  });

  it("does not revive an expired cached link after a remount", async () => {
    vi.useFakeTimers();
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL).mockResolvedValueOnce(REPLACEMENT_SIGNED_URL);
    const first = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await act(async () => {});
    expect(first.result.current.url).toBe(PREVIOUS_SIGNED_URL);
    first.unmount();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    const second = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    expect(second.result.current.url).toBeNull();
    await act(async () => {});
    expect(second.result.current.url).toBe(REPLACEMENT_SIGNED_URL);
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired mounted link with a newly authorized URL", async () => {
    vi.useFakeTimers();
    mocks.resolveFileUrl.mockResolvedValueOnce(PREVIOUS_SIGNED_URL).mockResolvedValueOnce(REPLACEMENT_SIGNED_URL);
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
  });

  it("does not let a previous workspace rejection clear the new preview", async () => {
    let rejectOld: ((reason: Error) => void) | undefined;
    mocks.resolveFileUrl
      .mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(REPLACEMENT_SIGNED_URL);
    const { result } = renderHook(() => useResolvedFileUrl(PREVIOUS_PATH));
    await act(async () => setActiveOrgId("workspace-b"));
    expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL);
    await act(async () => rejectOld?.(new Error("Previous workspace denied")));
    expect(result.current.url).toBe(REPLACEMENT_SIGNED_URL);
    expect(result.current.error).toBeNull();
  });

  it("does not cache a full URL or pretend it can renew that URL", async () => {
    vi.useFakeTimers();
    mocks.resolveFileUrl.mockResolvedValue(PREVIOUS_SIGNED_URL);
    const first = renderHook(() => useResolvedFileUrl(PREVIOUS_SIGNED_URL));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(1);
    first.unmount();
    renderHook(() => useResolvedFileUrl(PREVIOUS_SIGNED_URL));
    await act(async () => {});
    expect(mocks.resolveFileUrl).toHaveBeenCalledTimes(2);
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
