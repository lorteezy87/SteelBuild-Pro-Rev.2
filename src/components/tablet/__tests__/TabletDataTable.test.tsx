// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  TabletActionBar,
  TabletDataTable,
  TabletFilterBar,
  TabletFormSheet,
  TabletListDetail,
  TabletPage,
  visibleColumnIds,
} from "../index";
import type { ColumnPriority, PriorityColumn, TabletTableColumn } from "../index";

type ProjectRow = {
  id: string;
  number: string;
  status: string;
  updatedAt: string;
};

const rows: ProjectRow[] = [
  { id: "p1", number: "RFI-001", status: "Open", updatedAt: "2026-07-27" },
  { id: "p2", number: "RFI-002", status: "Closed", updatedAt: "2026-07-26" },
];

const columns: TabletTableColumn<ProjectRow>[] = [
  {
    id: "number",
    header: "Number",
    priority: "essential",
    cell: (row) => row.number,
  },
  {
    id: "status",
    header: "Status",
    priority: "secondary",
    cell: (row) => row.status,
  },
  {
    id: "updatedAt",
    header: "Updated",
    priority: "optional",
    cell: (row) => row.updatedAt,
  },
];

describe("TabletDataTable", () => {
  it("renders only visible tablet columns inside the scroll wrapper", () => {
    const { container } = render(<TabletDataTable columns={columns} rows={rows} band="tablet" />);

    expect(container.querySelector(".tablet-data-table-scroll")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Number" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Updated" })).not.toBeInTheDocument();
    expect(screen.queryByText("2026-07-27")).not.toBeInTheDocument();
  });

  it("does not make rows keyboard-focusable when onRowOpen is omitted", () => {
    render(<TabletDataTable columns={columns} rows={rows} band="tablet" />);

    const [firstRow, secondRow] = screen.getAllByRole("row").slice(1);

    expect(firstRow).not.toHaveAttribute("tabindex");
    expect(secondRow).not.toHaveAttribute("tabindex");
  });

  it("opens a row on click, Enter, and Space", async () => {
    const user = userEvent.setup();
    const onRowOpen = vi.fn();

    render(<TabletDataTable columns={columns} rows={rows} band="tablet" onRowOpen={onRowOpen} />);

    const [firstRow, secondRow] = screen.getAllByRole("row").slice(1);

    await user.click(firstRow);
    firstRow.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(firstRow).toHaveAttribute("tabindex", "0");
    expect(secondRow).toHaveAttribute("tabindex", "0");
    expect(onRowOpen).toHaveBeenNthCalledWith(1, rows[0]);
    expect(onRowOpen).toHaveBeenNthCalledWith(2, rows[0]);
    expect(onRowOpen).toHaveBeenNthCalledWith(3, rows[0]);
  });

  it("renders an empty row when no results are available", () => {
    render(<TabletDataTable columns={columns} rows={[]} band="phone" emptyLabel="No RFIs yet" />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("No RFIs yet")).toBeInTheDocument();
  });
});

describe("tablet barrel exports", () => {
  it("re-exports the tablet kit public surface and column priority helpers", () => {
    const sampleColumns: PriorityColumn[] = [{ id: "status", priority: "secondary" }];
    const priority: ColumnPriority = "essential";

    expect(TabletActionBar).toBeTypeOf("function");
    expect(TabletDataTable).toBeTypeOf("function");
    expect(TabletFilterBar).toBeTypeOf("function");
    expect(TabletFormSheet).toBeTypeOf("function");
    expect(TabletListDetail).toBeTypeOf("function");
    expect(TabletPage).toBeTypeOf("function");
    expect(priority).toBe("essential");
    expect(visibleColumnIds(sampleColumns, "phone")).toEqual([]);
  });
});
