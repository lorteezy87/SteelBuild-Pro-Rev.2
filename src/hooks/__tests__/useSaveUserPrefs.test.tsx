// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { DEFAULT_USER_PREFERENCES } from "@/lib/userPreferences/schema";

const updateMe = vi.fn();
vi.mock("@/api/supabaseClient", () => ({
  auth: { updateMe: (...args: unknown[]) => updateMe(...args) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useSaveUserPrefs } from "@/hooks/useSaveUserPrefs";

function setup(initial: Record<string, unknown>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(["user-settings", "user-1"], initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user: { id: "user-1", ...initial } } as never}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useSaveUserPrefs(), { wrapper }) };
}

describe("useSaveUserPrefs", () => {
  beforeEach(() => updateMe.mockReset());

  it("optimistically updates cached settings and keeps them after success", async () => {
    updateMe.mockResolvedValueOnce({ theme: "light" });
    const { result, queryClient } = setup({ theme: "dark" });

    act(() => result.current.savePatch({ theme: "light" }));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "light" });
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(updateMe).toHaveBeenCalledWith({ theme: "light" });
  });

  it("marks the active preset custom only when a preset-owned preference changes", async () => {
    updateMe.mockResolvedValueOnce({ pinned_modules: ["RFIs"], workspace_preset: "custom" });
    const { result } = setup({ workspace_preset: "project_manager", pinned_modules: ["ProjectsHub"] });

    act(() => result.current.savePatch({ pinned_modules: ["RFIs"] }));

    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(updateMe).toHaveBeenCalledWith({ pinned_modules: ["RFIs"], workspace_preset: "custom" });
  });

  it("rolls cached settings back when persistence fails", async () => {
    updateMe.mockRejectedValueOnce(new Error("offline"));
    const { result, queryClient } = setup({ theme: "dark" });

    act(() => result.current.savePatch({ theme: "light" }));
    await waitFor(() => expect(result.current.syncState).toBe("error"));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "dark" });
  });

  it("preserves profile fields while replacing the complete preference set", async () => {
    updateMe.mockResolvedValueOnce({ full_name: "Bea", theme: "system" });
    const { result, queryClient } = setup({ full_name: "Bea", job_title: "PM", theme: "dark" });

    act(() => result.current.saveAll(DEFAULT_USER_PREFERENCES));

    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({
      full_name: "Bea",
      job_title: "PM",
      theme: "system",
    });
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
  });

  it("coalesces rapid saves so only the newest value is persisted", async () => {
    updateMe.mockResolvedValueOnce({ theme: "dark" });
    const { result, queryClient } = setup({ full_name: "Bea", theme: "system" });

    act(() => {
      result.current.savePatch({ theme: "light" });
      result.current.savePatch({ theme: "dark" });
    });

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({ theme: "dark" });
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "dark" });
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ full_name: "Bea", theme: "dark" });
  });

  it("does not roll back a newer edit when an older queued save fails", async () => {
    let rejectFirst: (reason: Error) => void = () => {};
    updateMe
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce({ theme: "dark" });
    const { result, queryClient } = setup({ theme: "system" });

    act(() => result.current.savePatch({ theme: "light" }));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));

    act(() => result.current.savePatch({ theme: "dark" }));

    rejectFirst(new Error("offline"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "dark" });
  });

  it("rolls back to the last server-confirmed value when consecutive writes fail", async () => {
    let rejectFirst: (reason: Error) => void = () => {};
    updateMe
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockRejectedValueOnce(new Error("still offline"));
    const { result, queryClient } = setup({ theme: "system" });

    act(() => { void result.current.savePatch({ theme: "light" }); });
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    act(() => { void result.current.savePatch({ theme: "dark" }); });

    rejectFirst(new Error("offline"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.syncState).toBe("error"));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "system" });
  });

  it("makes a superseded caller follow the current failed write", async () => {
    let rejectFirst: (reason: Error) => void = () => {};
    updateMe
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockRejectedValueOnce(new Error("still offline"));
    const { result } = setup({ theme: "system" });
    let first!: ReturnType<typeof result.current.savePatchConfirmed>;
    let second!: ReturnType<typeof result.current.savePatchConfirmed>;

    act(() => { first = result.current.savePatchConfirmed({ theme: "light" }); });
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    act(() => { second = result.current.savePatchConfirmed({ theme: "dark" }); });
    rejectFirst(new Error("offline"));

    await expect(first).resolves.toEqual({ status: "failed", confirmed: { theme: "system" } });
    await expect(second).resolves.toEqual({ status: "failed", confirmed: { theme: "system" } });
  });

  it("acknowledges a failed migration only after its superseding removal persists", async () => {
    let rejectMigration: (reason: Error) => void = () => {};
    updateMe
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectMigration = reject; }))
      .mockResolvedValueOnce({ pinned_modules: [], workspace_preset: "custom" });
    const { result, queryClient } = setup({ workspace_preset: "custom", pinned_modules: [] });
    let migration!: ReturnType<typeof result.current.savePatchConfirmed>;
    let removal!: ReturnType<typeof result.current.savePatchConfirmed>;

    act(() => { migration = result.current.savePatchConfirmed({ pinned_modules: ["RFIs"] }); });
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    act(() => { removal = result.current.savePatchConfirmed({ pinned_modules: [] }); });
    rejectMigration(new Error("migration request failed"));

    await expect(migration).resolves.toEqual({ status: "persisted" });
    await expect(removal).resolves.toEqual({ status: "persisted" });
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ pinned_modules: [] });
  });
});
