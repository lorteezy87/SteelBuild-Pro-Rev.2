// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandCenterControlCenter from "../CommandCenterControlCenter";

vi.mock("@/components/command", async () => {
  const actual = await vi.importActual<typeof import("@/components/command")>("@/components/command");
  return { ...actual, useCommandSkin: (): void => undefined };
});

describe("CommandCenterControlCenter", () => {
  it("renders the three tactical horizons and preserves the full action register", () => {
    render(
      <CommandCenterControlCenter
        sources={{
          rfis: [],
          submittals: [],
          changeOrders: [],
          deliveries: [],
          workPackages: [],
          projects: [],
          scheduleTasks: [],
        }}
        projectName="BIMC ED Expansion"
        search=""
        onSearch={vi.fn()}
        typeFilter="All"
        onTypeChange={vi.fn()}
        onOpenItem={vi.fn()}
        onForwardLook={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Command Center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NOW" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "48 HOURS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "10 DAYS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Action Items" })).toBeInTheDocument();
    expect(screen.getByText("Forward Look →")).toBeInTheDocument();
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Command Center register drilldowns", () => {
  it("opens the exact brief source and exposes missing evidence alongside calendar windows", () => {
    const onOpenItem = vi.fn();
    const hold = { id: "held-wp", name: "Erect sequence 2", status: "On Hold", project_id: "p1" };
    render(<CommandCenterControlCenter
      sources={{
        rfis: [{ id: "unknown-rfi", title: "Unassigned connection", status: "Open", project_id: "p1" }],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [hold],
        projects: [{ id: "p1" }], scheduleTasks: [],
      }}
      search="unrelated filter" onSearch={vi.fn()} typeFilter="TASK" onTypeChange={vi.fn()}
      onOpenItem={onOpenItem} onForwardLook={vi.fn()} dataUpdatedAt={Date.now()} isRefreshing
    />);
    const brief = screen.getByRole("region", { name: "Execution brief" });
    expect(brief).toHaveTextContent("Local calendar days");
    expect(brief).toHaveTextContent("1 without an owner · 1 without a valid required date");
    expect(brief).toHaveTextContent("Refreshing sources");
    fireEvent.click(within(brief).getByRole("button", { name: /Erect sequence 2/ }));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: "held-wp", projectId: "p1", raw: hold }));
    fireEvent.click(within(brief).getByRole("button", { name: /Unassigned connection/ }));
    expect(onOpenItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: "unknown-rfi" }));
  });

  it("opens all rows from an overflowing horizon and can restore the complete register", () => {
    const onSearch = vi.fn();
    const onTypeChange = vi.fn();
    render(<CommandCenterControlCenter
      sources={{
        rfis: [
          ...Array.from({ length: 8 }, (_, i) => ({
            id: `r${i}`, title: `Urgent connection ${i}`, status: "Open", date_required: "2026-10-05",
          })),
          { id: "later", title: "Future review", status: "Open", date_required: "2026-10-15" },
        ],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [],
        projects: [{ id: "p1" }], scheduleTasks: [],
      }}
      search="" onSearch={onSearch} typeFilter="All" onTypeChange={onTypeChange}
      onOpenItem={vi.fn()} onForwardLook={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: "View all 8 items in NOW" }));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(onTypeChange).toHaveBeenCalledWith("All");
    expect(screen.getByRole("heading", { name: "NOW Action Items" })).toHaveFocus();
    const register = screen.getByRole("table");
    expect(within(register).getAllByRole("button")).toHaveLength(8);
    expect(within(register).queryByText(/Future review/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all horizons" }));
    expect(within(register).getByText(/Future review/)).toBeInTheDocument();
  });

  it("provides a task filter backed by open schedule rows", () => {
    const onTypeChange = vi.fn();
    render(<CommandCenterControlCenter
      sources={{
        rfis: [{ id: "rfi", title: "Design review", status: "Open" }],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [], projects: [],
        scheduleTasks: [{ id: "task", task_name: "Erect sequence 3", status: "In Progress", end_date: "2026-10-08" }],
      }}
      search="" onSearch={vi.fn()} typeFilter="TASK" onTypeChange={onTypeChange}
      onOpenItem={vi.fn()} onForwardLook={vi.fn()}
    />);
    const taskFilter = screen.getByRole("button", { name: "TASK" });
    expect(taskFilter).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(taskFilter);
    expect(onTypeChange).toHaveBeenCalledWith("TASK");
    const register = screen.getByRole("table");
    expect(within(register).getByText("Erect sequence 3")).toBeInTheDocument();
    expect(within(register).queryByText(/Design review/)).not.toBeInTheDocument();
  });
});
