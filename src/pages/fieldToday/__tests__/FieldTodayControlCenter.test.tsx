// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldTodayControlCenter, {
  type FieldTodayControlCenterProps,
} from "../FieldTodayControlCenter";

const TODAY = "2026-09-08";
const TASK = {
  id: "task-1",
  task_name: "Set columns",
  start_date: "2026-09-07",
  end_date: TODAY,
  percent_complete: 25,
  resource_names: "Erection crew",
  location: "Grid A",
  phase: "Erection",
};

function renderControlCenter(
  overrides: Partial<FieldTodayControlCenterProps> = {},
) {
  const props: FieldTodayControlCenterProps = {
    projectName: "Test Project",
    todayIso: TODAY,
    tasks: [TASK],
    photos: [],
    punchItems: [],
    pendingSync: 0,
    isLoading: false,
    search: "",
    onSearch: vi.fn(),
    statusFilter: "all",
    onStatusFilter: vi.fn(),
    onSetProgress: vi.fn(),
    onAddPunch: vi.fn(),
    onAddPhoto: vi.fn(),
    onDailyLog: vi.fn(),
    onFlushOutbox: vi.fn(),
    savingTaskId: null,
    uploadingPhoto: false,
    ...overrides,
  };
  return { props, ...render(<FieldTodayControlCenter {...props} />) };
}

describe("FieldTodayControlCenter interactions", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("routes capture, filter, sync, and progress actions through the passed handlers", () => {
    const { props } = renderControlCenter({ pendingSync: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Add Punch" }));
    fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Daily Log" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    fireEvent.change(screen.getByPlaceholderText(/search tasks/i), {
      target: { value: "columns" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Due Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Set progress 75%" }));

    expect(props.onAddPunch).toHaveBeenCalledOnce();
    expect(props.onAddPhoto).toHaveBeenCalledOnce();
    expect(props.onDailyLog).toHaveBeenCalledOnce();
    expect(props.onFlushOutbox).toHaveBeenCalledOnce();
    expect(props.onSearch).toHaveBeenCalledWith("columns");
    expect(props.onStatusFilter).toHaveBeenCalledWith("due-today");
    expect(props.onSetProgress).toHaveBeenCalledWith(TASK, 75);
  });

  it("resets the task filter and scrolls to the table from Today's Plan", () => {
    const { props } = renderControlCenter({ statusFilter: "active" });
    fireEvent.click(screen.getAllByRole("button", { name: "View all" })[0]);

    expect(props.onStatusFilter).toHaveBeenCalledWith("all");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("keeps loading and unavailable evidence truthful", () => {
    renderControlCenter({ tasks: [], isLoading: true, uploadingPhoto: true });

    expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    expect(screen.getByText("Loading recovery work…")).toBeInTheDocument();
    expect(screen.getByText("completion time unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
  });
});
