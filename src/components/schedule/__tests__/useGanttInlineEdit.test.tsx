// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGanttInlineEdit } from "../useGanttInlineEdit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGanttInlineEdit", () => {
  it("starts editing with the same normalized values shown by the row", () => {
    const { result } = renderHook(() => useGanttInlineEdit({ onSave: vi.fn() }));
    const stopPropagation = vi.fn();

    act(() => {
      result.current.startInlineEdit({
        id: "task-1",
        task_name: null,
        start_date: "2026-09-12",
        end_date: null,
        status: "Complete",
        percent_complete: 15,
      }, { stopPropagation });
    });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.editingId).toBe("task-1");
    expect(result.current.editDraft).toEqual({
      task_name: "",
      start_date: "2026-09-12",
      end_date: "",
      status: "Complete",
      percent_complete: 100,
    });
  });

  it("does not open the editor for a summary row", () => {
    const { result } = renderHook(() => useGanttInlineEdit({ onSave: vi.fn() }));
    const stopPropagation = vi.fn();

    act(() => {
      result.current.startInlineEdit({
        id: "summary-1",
        task_name: "Fabrication",
        _hasChildren: true,
      }, { stopPropagation });
    });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toEqual({});
  });

  it("saves the draft and closes the editor after a successful write", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useGanttInlineEdit({ onSave }));

    act(() => {
      result.current.startInlineEdit({
        id: "task-2",
        task_name: "Set steel",
        status: "In Progress",
        percent_complete: null,
      }, { stopPropagation: vi.fn() });
      result.current.setEditDraft((draft) => ({ ...draft, end_date: "2026-09-30" }));
    });

    await act(async () => {
      await result.current.commitEdit("task-2");
    });

    expect(onSave).toHaveBeenCalledWith({
      id: "task-2",
      task_name: "Set steel",
      start_date: "",
      end_date: "2026-09-30",
      status: "In Progress",
      percent_complete: null,
    });
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toEqual({});
    expect(result.current.saving).toBe(false);
  });

  it("keeps the draft open when saving fails", async () => {
    const error = new Error("write failed");
    const onSave = vi.fn().mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useGanttInlineEdit({ onSave }));

    act(() => {
      result.current.startInlineEdit({
        id: "task-3",
        task_name: "Ship steel",
      }, { stopPropagation: vi.fn() });
    });

    await act(async () => {
      await result.current.commitEdit("task-3");
    });

    expect(consoleError).toHaveBeenCalledWith("Gantt save failed:", error);
    expect(result.current.editingId).toBe("task-3");
    expect(result.current.editDraft.task_name).toBe("Ship steel");
    expect(result.current.saving).toBe(false);
  });

  it("cancels editing and clears the draft", () => {
    const { result } = renderHook(() => useGanttInlineEdit({ onSave: vi.fn() }));

    act(() => {
      result.current.startInlineEdit({
        id: "task-4",
        task_name: "Detail stairs",
      }, { stopPropagation: vi.fn() });
      result.current.cancelEdit();
    });

    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toEqual({});
  });
});
