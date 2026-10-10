// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/lib/AuthContext";
import { LEGACY_AUDIT_KEY, localDataKey } from "@/lib/localDataOwnership";
import { useDestructiveAudit } from "../useDestructiveAudit";

const mocks = vi.hoisted(() => ({
  userId: "a" as string | null, orgId: "one" as string | null,
}));
vi.mock("@/lib/AuthContext", async () => ({
  AuthContext: (await import("react")).createContext(null),
}));
vi.mock("@/components/shared/OrgContext", () => ({
  useOptionalOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null }),
}));

function mount() {
  return renderHook(() => useDestructiveAudit(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      <AuthContext.Provider value={{
        isAuthenticated: !!mocks.userId,
        user: mocks.userId ? { id: mocks.userId, email: mocks.userId + "@example.test" } : null,
      } as AuthContextValue}>{children}</AuthContext.Provider>,
  });
}
beforeEach(() => {
  localStorage.clear();
  mocks.userId = "a"; mocks.orgId = "one";
});
afterEach(cleanup);

it.each([
  { userId: "b", orgId: "one", label: "user" },
  { userId: "a", orgId: "two", label: "workspace" },
])("keeps audit writes and reads inside the current $label scope", ({ userId, orgId }) => {
  const { result, rerender, unmount } = mount();
  act(() => result.current.logAction("first", { userId: "spoofed", orgId: "spoofed" }));
  const firstKey = localDataKey("audit", { userId: "a", orgId: "one" })!;
  const saved = localStorage.getItem(firstKey);
  expect(result.current.getLog()).toMatchObject([{ action: "first", userId: "a", orgId: "one" }]);
  const staleRead = result.current.getLog;
  const staleWrite = result.current.logAction;

  mocks.userId = userId; mocks.orgId = orgId;
  rerender();
  expect(result.current.getLog()).toEqual([]);
  expect(staleRead()).toEqual([]);
  act(() => staleWrite("stale"));
  act(() => result.current.logAction("second"));
  expect(localStorage.getItem(firstKey)).toBe(saved);
  expect(result.current.getLog()).toMatchObject([{ action: "second", userId, orgId }]);

  mocks.userId = "a"; mocks.orgId = "one";
  rerender();
  expect(result.current.getLog("first")).toHaveLength(1);
  expect(result.current.getLog("second")).toEqual([]);
  unmount();
  const restored = mount();
  expect(restored.result.current.getLog()).toMatchObject([{ action: "first" }]);
});

it("only exposes matching legacy user IDs and preserves the legacy store when clearing", () => {
  const legacy = JSON.stringify([
    { ts: "2026-01-01", userId: "a", action: "owned" },
    { ts: "2026-01-02", userId: "b", action: "other-user" },
    { ts: "2026-01-03", userId: null, action: "unknown-owner" },
    { ts: "2026-01-04", userId: "a", orgId: "two", action: "other-workspace" },
  ]);
  localStorage.setItem(LEGACY_AUDIT_KEY, legacy);
  const { result, rerender } = mount();
  expect(result.current.getLog()).toMatchObject([{ action: "owned", legacyWorkspaceUnknown: true, scopeLabel: "Historical user/device only (workspace unknown)" }]);
  act(() => result.current.clearLog());
  expect(result.current.getLog()).toEqual([]);
  expect(localStorage.getItem(LEGACY_AUDIT_KEY)).toBe(legacy);
  mocks.userId = "b";
  rerender();
  expect(result.current.getLog()).toMatchObject([{ action: "other-user" }]);
  expect(localStorage.getItem(LEGACY_AUDIT_KEY)).toBe(legacy);
});

it("retains scoped audit records when the untouched legacy payload is malformed", () => {
  localStorage.setItem(LEGACY_AUDIT_KEY, "not-json");
  const { result } = mount();
  act(() => result.current.logAction("saved"));
  expect(result.current.getLog()).toMatchObject([{ action: "saved" }]);
  expect(localStorage.getItem(LEGACY_AUDIT_KEY)).toBe("not-json");
});

it("does not read, write, or clear another scope without authenticated user and workspace", () => {
  localStorage.setItem(LEGACY_AUDIT_KEY, "preserve");
  mocks.userId = null;
  const { result, rerender } = mount();
  act(() => { result.current.logAction("anonymous"); result.current.clearLog(); });
  expect(result.current.getLog()).toEqual([]);
  mocks.userId = "a"; mocks.orgId = null;
  rerender();
  act(() => { result.current.logAction("unscoped"); result.current.clearLog(); });
  expect(result.current.getLog()).toEqual([]);
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem(LEGACY_AUDIT_KEY)).toBe("preserve");
});
