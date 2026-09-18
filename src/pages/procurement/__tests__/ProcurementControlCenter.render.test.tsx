// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProcurementControlCenter from "../ProcurementControlCenter";
import type { ProcurementItem } from "../procurementControlCenter.derive";

describe("ProcurementControlCenter Wave 3 layout", () => {
  it("shows material attention and missing required-date evidence", () => {
    const rows: ProcurementItem[] = [
      {
        id: "p-1",
        status: "PO Issued",
        vendor: "Nucor",
        po_number: "PO-101",
        description: "Wide flange material",
        required_date: null,
        is_long_lead: true,
      },
    ];

    render(
      <ProcurementControlCenter
        projectName="BIMC ED"
        items={rows}
        filtered={rows}
        search=""
        onSearch={vi.fn()}
        categoryFilter="all"
        onCategoryChange={vi.fn()}
        statusFilter="all"
        onStatusChange={vi.fn()}
        onOpenItem={vi.fn()}
        onExport={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Procurement Control" })).toBeInTheDocument();
    expect(screen.getByText("Material Attention")).toBeInTheDocument();
    expect(screen.getByText("Missing Need-By")).toBeInTheDocument();
    expect(screen.getAllByText(/PO-101/).length).toBeGreaterThan(0);
  });
});
