/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { AuthContext } from "@/lib/AuthContext";
import { useAppSecurity } from "@/components/shared/useAppSecurity";

describe("useAppSecurity", () => {
  beforeEach(() => {
    localStorage.setItem("current_user_email", "stale@example.com");
    localStorage.setItem("current_user_id", "stale-id");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not treat localStorage identity leftovers as authenticated", () => {
    const wrapper = ({ children }) => (
      <AuthContext.Provider value={null}>{children}</AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it("uses AuthContext user when authenticated", () => {
    const user = { id: "u1", email: "pm@example.com" };
    const wrapper = ({ children }) => (
      <AuthContext.Provider
        value={{
          user,
          isAuthenticated: true,
          loading: false,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useAppSecurity(), { wrapper });
    expect(result.current.user).toEqual(user);
  });

  it("assertProjectId forces the active project id", () => {
    const wrapper = ({ children }) => (
      <AuthContext.Provider
        value={{ user: { id: "u1", email: "pm@example.com" }, isAuthenticated: true, loading: false }}
      >
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
});
