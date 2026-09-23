// @vitest-environment jsdom
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/lib/AuthContext";
import { useProjectRoleAtLeast } from "../useProjectRoleAtLeast";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));

function wrapper(userId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = (userId ? { user: { id: userId } } : { user: null }) as unknown as AuthContextValue;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useProjectRoleAtLeast", () => {
  it("asks user_has_project_role_at_least with the project and floor", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useProjectRoleAtLeast("project-1", "admin"), { wrapper: wrapper("user-1") });
    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith("user_has_project_role_at_least", {
      p_project_id: "project-1",
      p_min_role: "admin",
    });
  });

  it("is false when the database says no", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => useProjectRoleAtLeast("project-1", "admin"), { wrapper: wrapper("user-1") });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allowed).toBe(false);
  });

  it("fails closed on an RPC error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useProjectRoleAtLeast("project-1", "admin"), { wrapper: wrapper("user-1") });
    expect(result.current.allowed).toBe(false);
    // The hook retries once (as useProjectRole does) before settling on the error.
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 4000 });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(result.current.allowed).toBe(false);
  });

  it("does not call the database without a user or project", () => {
    const noUser = renderHook(() => useProjectRoleAtLeast("project-1", "admin"), { wrapper: wrapper(null) });
    const noProject = renderHook(() => useProjectRoleAtLeast(null, "admin"), { wrapper: wrapper("user-1") });
    expect(noUser.result.current).toEqual({ allowed: false, isLoading: false });
    expect(noProject.result.current).toEqual({ allowed: false, isLoading: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
