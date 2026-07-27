// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResetOnProjectChange } from "../useResetOnProjectChange";

describe("useResetOnProjectChange", () => {
  it("does not reset on initial mount", () => {
    const onReset = vi.fn();
    renderHook(({ projectId }) => useResetOnProjectChange(projectId, onReset), {
      initialProps: { projectId: "p1" as string | null },
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  it("resets when projectId changes", () => {
    const onReset = vi.fn();
    const { rerender } = renderHook(
      ({ projectId }) => useResetOnProjectChange(projectId, onReset),
      { initialProps: { projectId: "p1" as string | null } },
    );
    rerender({ projectId: "p2" });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("resets when clearing the active project", () => {
    const onReset = vi.fn();
    const { rerender } = renderHook(
      ({ projectId }) => useResetOnProjectChange(projectId, onReset),
      { initialProps: { projectId: "p1" as string | null } },
    );
    rerender({ projectId: null });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does not reset when projectId is unchanged across renders", () => {
    const onReset = vi.fn();
    const { rerender } = renderHook(
      ({ projectId }) => useResetOnProjectChange(projectId, onReset),
      { initialProps: { projectId: "p1" as string | null } },
    );
    rerender({ projectId: "p1" });
    rerender({ projectId: "p1" });
    expect(onReset).not.toHaveBeenCalled();
  });
});
