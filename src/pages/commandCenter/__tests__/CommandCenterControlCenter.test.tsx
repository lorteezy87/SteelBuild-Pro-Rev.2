// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandCenterControlCenter from "../CommandCenterControlCenter";

vi.mock("@/components/command", async () => {
  const actual = await vi.importActual<typeof import("@/components/command")>("@/components/command");
  return { ...actual, useCommandSkin: (): void => undefined };
});

describe("CommandCenterControlCenter", () => {
  it("offers the three horizon filters and the complete action register", () => {
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
    for (const horizon of ["NOW", "48 HOURS", "10 DAYS"]) {
      expect(screen.getByRole("button", { name: `View all 0 items in ${horizon}` })).toHaveAttribute("aria-pressed", "false");
    }
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
  it("summarizes exceptions once and opens each exact source from the decision register", () => {
    const onOpenItem = vi.fn();
    const hold = { id: "held-wp", name: "Erect sequence 2", status: "On Hold", project_id: "p1" };
    render(<CommandCenterControlCenter
      sources={{
        rfis: [{ id: "unknown-rfi", title: "Unassigned connection", status: "Open", project_id: "p1" }],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [hold],
        projects: [{ id: "p1" }], scheduleTasks: [],
      }}
      search="" onSearch={vi.fn()} typeFilter="All" onTypeChange={vi.fn()}
      onOpenItem={onOpenItem} onForwardLook={vi.fn()} dataUpdatedAt={Date.now()} isRefreshing
    />);
    const brief = screen.getByRole("region", { name: "Execution brief" });
    expect(brief).toHaveTextContent("0 overdue · 1 held or delayed · 0 RFIs with impact");
    expect(brief).toHaveTextContent("1 without an owner · 1 without a valid required date");
    expect(brief).toHaveTextContent("Refreshing sources");
    expect(within(brief).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Erect sequence 2/)).toHaveLength(1);
    const register = screen.getByRole("table");
    fireEvent.click(within(register).getByRole("button", { name: /Erect sequence 2/ }));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: "held-wp", projectId: "p1", raw: hold }));
    const missingOwner = within(register).getByRole("button", { name: /Unassigned connection/ });
    expect(missingOwner).toHaveTextContent("Not recorded");
    expect(missingOwner).not.toHaveTextContent("normal");
    fireEvent.keyDown(missingOwner, { key: "Enter" });
    expect(onOpenItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: "unknown-rfi" }));
  });

  it("keeps recorded holds and RFI impacts visible when their due dates are overdue", () => {
    render(<CommandCenterControlCenter
      sources={{
        projects: [{ id: "p1" }], rfis: [{ id: "impact", title: "Anchor approval", status: "Open", date_required: "2026-10-05", schedule_impact: true }],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [],
        scheduleTasks: [{ id: "held-task", task_name: "Held erection", status: "On Hold", end_date: "2026-10-05" }],
      }}
      search="" onSearch={vi.fn()} typeFilter="All" onTypeChange={vi.fn()}
      onOpenItem={vi.fn()} onForwardLook={vi.fn()}
    />);
    expect(screen.getByRole("region", { name: "Execution brief" })).toHaveTextContent("2 overdue · 1 held or delayed · 1 RFI with impact");
    fireEvent.click(screen.getByRole("button", { name: "View all 2 items in NOW" }));
    const register = screen.getByRole("table");
    expect(within(register).getAllByRole("button")).toHaveLength(2);
    expect(within(register).getAllByText("Overdue")).toHaveLength(2);
    expect(within(register).getByText("On Hold")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "View all 8 items in NOW" })).toHaveAttribute("aria-pressed", "true");
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

  it("clears the prior project's horizon so undated work in the new project remains visible", () => {
    const props = {
      sources: {
        rfis: [{ id: "urgent", title: "Prior project approval", status: "Open", date_required: "2026-10-05" }],
        submittals: [], changeOrders: [], deliveries: [], workPackages: [], scheduleTasks: [], projects: [{ id: "p1" }],
      },
      search: "", onSearch: vi.fn(), typeFilter: "All", onTypeChange: vi.fn(), onOpenItem: vi.fn(), onForwardLook: vi.fn(),
    };
    const { rerender } = render(<CommandCenterControlCenter {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "View all 1 item in NOW" }));
    expect(screen.getByRole("heading", { name: "NOW Action Items" })).toBeInTheDocument();
    rerender(<CommandCenterControlCenter {...props} sources={{
      ...props.sources, projects: [{ id: "p2" }],
      rfis: [{ id: "undated-new-project", title: "New project approval", status: "Open" }],
    }} />);
    expect(screen.getByRole("heading", { name: "All Action Items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all horizons" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getByText(/New project approval/)).toBeInTheDocument();
    expect(screen.queryByText(/Prior project approval/)).not.toBeInTheDocument();
  });
});
