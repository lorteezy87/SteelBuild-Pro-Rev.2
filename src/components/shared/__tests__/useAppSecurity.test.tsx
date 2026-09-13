/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { AuthContext, type AppUser, type AuthContextValue } from "@/lib/AuthContext";
import { useAppSecurity } from "@/components/shared/useAppSecurity";

function authValue(partial: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoadingAuth: false,
    isLoggingIn: false,
    isLoadingPublicSettings: false,
    authError: null,
    // H23 MFA surface. Added when AuthContextValue gained the degraded-status
    // fields; the stub must satisfy the whole contract or every consumer test
    // fails to typecheck.
    mfaStatusDegraded: false,
    mfaStatusMessage: null,
    retryMfaStatus: async () => {},
    appPublicSettings: null,
    logout: async () => {},
    loginWithPassword: async () => ({ success: false, error: { type: "auth_required", message: "n/a" } }),
    signUpWithPassword: async () => ({ success: false, error: { type: "auth_required", message: "n/a" } }),
    isPasswordRecovery: false,
    sendPasswordReset: async () => ({ success: false, error: "n/a" }),
    updatePassword: async () => ({ success: false, error: "n/a" }),
    mfaRequired: false,
    listMfaFactors: async () => [],
    enrollMfa: async () => ({ success: false, error: "n/a" }),
    verifyMfaFactor: async () => ({ success: false, error: "n/a" }),
    completeMfaChallenge: async () => ({ success: false, error: "n/a" }),
    unenrollMfa: async () => ({ success: false, error: "n/a" }),
    navigateToLogin: () => {},
    checkAppState: async () => {},
    ...partial,
  };
}

describe("useAppSecurity", () => {
  beforeEach(() => {
    localStorage.setItem("current_user_email", "stale@example.com");
    localStorage.setItem("current_user_id", "stale-id");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not treat localStorage identity leftovers as authenticated", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={authValue({ user: null, isAuthenticated: false })}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it("uses AuthContext user when authenticated", () => {
    const user: AppUser = {
      id: "u1",
      email: "pm@example.com",
      full_name: "PM User",
      role: "admin",
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={authValue({ user, isAuthenticated: true })}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    expect(result.current.user).toEqual(user);
  });

  it("assertProjectId forces the active project id", () => {
    const user: AppUser = {
      id: "u1",
      email: "pm@example.com",
      full_name: "PM User",
      role: "admin",
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={authValue({ user, isAuthenticated: true })}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(result.current.assertProjectId({ project_id: "other", name: "x" }, "active")).toEqual({
      project_id: "active",
      name: "x",
    });
    warn.mockRestore();
  });

  it("preserves the legacy payload when no project is active", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={authValue({ user: null, isAuthenticated: false })}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    const payload = { project_id: "legacy-project", name: "x" };

    expect(result.current.assertProjectId(payload, null)).toBe(payload);
  });

  it("stamps identity from the authenticated DB-backed user", () => {
    const user: AppUser = {
      id: "u1",
      email: "pm@example.com",
      full_name: "PM User",
      role: "pm",
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={authValue({ user, isAuthenticated: true })}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });

    expect(result.current.stamp({ name: "x" })).toEqual({
      name: "x",
      created_by: "pm@example.com",
      created_uid: "u1",
    });
  });
});
