// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoRecord } from "../coControlCenter.derive";

type TestColumn = {
  key: string;
  render?: (row: CoRecord) => React.ReactNode;
};

type TestTableProps = {
  columns: TestColumn[];
  rows: CoRecord[];
  onRowClick: (row: CoRecord) => void;
};

vi.mock("@/components/command", () => ({
  PageHero: () => null,
  KpiStrip: () => null,
  DecisionPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  FilterBar: () => null,
  DataTable: ({ columns, rows, onRowClick }: TestTableProps) => (
    <div>
      {rows.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`} onClick={() => onRowClick(row)}>
          {columns.map((column) => <span key={column.key}>{column.render?.(row)}</span>)}
        </div>
      ))}
    </div>
  ),
  useCommandSkin: () => {},
}));

vi.mock("@/config/launcherConfig", () => ({ photoFor: () => null }));

import CoControlCenter from "../CoControlCenter";

const co: CoRecord = {
  id: "co-1",
  co_number: "CO #004",
  title: "Added support steel",
  description: "",
  reason_code: "Design Change",
  status: "Draft",
  co_amount: 1200,
  schedule_impact_days: 0,
};

describe("CoControlCenter", () => {
  it("routes the row delete button to delete without opening edit", () => {
    const onOpenCo = vi.fn();
    const onDeleteCo = vi.fn();

    render(
      <CoControlCenter
        projectName="Project One"
        cos={[co]}
        filtered={[co]}
        search=""
        onSearch={() => {}}
        statusFilter="all"
        onFilterChange={() => {}}
        onOpenCo={onOpenCo}
        onDeleteCo={onDeleteCo}
        onExport={() => {}}
        baseContract={100000}
        revisedContract={101200}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete CO #004" }));

    expect(onDeleteCo).toHaveBeenCalledWith(co);
    expect(onOpenCo).not.toHaveBeenCalled();
  });
});
