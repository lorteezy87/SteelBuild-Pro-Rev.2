// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthContext } from "@/lib/AuthContext";

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
  it("optimistically updates cached settings and keeps them after success", async () => {
    updateMe.mockResolvedValueOnce({ theme: "light" });
    const { result, queryClient } = setup({ theme: "dark" });

    act(() => result.current.savePatch({ theme: "light" }));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "light" });
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(updateMe).toHaveBeenCalledWith({ theme: "light", workspace_preset: "custom" });
  });

  it("rolls cached settings back when persistence fails", async () => {
    updateMe.mockRejectedValueOnce(new Error("offline"));
    const { result, queryClient } = setup({ theme: "dark" });

    act(() => result.current.savePatch({ theme: "light" }));
    await waitFor(() => expect(result.current.syncState).toBe("error"));
    expect(queryClient.getQueryData(["user-settings", "user-1"])).toMatchObject({ theme: "dark" });
  });
});
