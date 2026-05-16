// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormValidation } from "../useFormValidation";

describe("useFormValidation", () => {
  it("returns no errors for valid action_item data", () => {
    const { result } = renderHook(() => useFormValidation("action_item"));
    let valid;
    act(() => {
      valid = result.current.runValidation({
        project_id: "proj-1",
        title: "Fix anchor bolts",
        due_date: "2026-06-01",
      });
    });
    expect(valid).toBe(true);
    expect(result.current.fieldErrors).toEqual({});
  });

  it("returns field errors for missing required fields", () => {
    const { result } = renderHook(() => useFormValidation("action_item"));
    let valid;
    act(() => {
      valid = result.current.runValidation({
        project_id: "",
        title: "",
        due_date: "2026-06-01",
      });
    });
    expect(valid).toBe(false);
    expect(result.current.fieldErrors.project_id).toBeDefined();
    expect(result.current.fieldErrors.title).toBeDefined();
  });

  it("clearField removes a single error", () => {
    const { result } = renderHook(() => useFormValidation("action_item"));
    act(() => {
      result.current.runValidation({ project_id: "", title: "" });
    });
    expect(result.current.fieldErrors.title).toBeDefined();
    act(() => {
      result.current.clearField("title");
    });
    expect(result.current.fieldErrors.title).toBeUndefined();
    expect(result.current.fieldErrors.project_id).toBeDefined();
  });

  it("clearErrors resets all errors", () => {
    const { result } = renderHook(() => useFormValidation("action_item"));
    act(() => {
      result.current.runValidation({ project_id: "", title: "" });
    });
    expect(Object.keys(result.current.fieldErrors).length).toBeGreaterThan(0);
    act(() => {
      result.current.clearErrors();
    });
    expect(result.current.fieldErrors).toEqual({});
  });

  it("validates inspection with date ordering", () => {
    const { result } = renderHook(() => useFormValidation("inspection"));
    let valid;
    act(() => {
      valid = result.current.runValidation({
        project_id: "p1",
        inspection_type: "Welds",
        scheduled_date: "2026-07-01",
        completed_date: "2026-06-01",
      });
    });
    expect(valid).toBe(false);
    expect(result.current.fieldErrors.completed_date).toContain("must not be before");
  });

  it("handles unknown entity gracefully", () => {
    const { result } = renderHook(() => useFormValidation("nonexistent"));
    let valid;
    act(() => {
      valid = result.current.runValidation({});
    });
    expect(valid).toBe(true);
  });
});
