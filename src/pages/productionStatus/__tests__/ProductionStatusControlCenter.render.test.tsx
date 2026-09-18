// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductionStatusControlCenter from "../ProductionStatusControlCenter";
import type { PieceProductionRow } from "@/lib/production/repository";

function piece(overrides: Partial<PieceProductionRow> = {}): PieceProductionRow {
  return {
    id: "piece-1",
    project_id: "project-1",
    piece_mark: "B-101",
    assembly_mark: "B-101",
    status: "Weld",
    percent_complete: 60,
    quantity: 1,
    weight: 1240,
    sequence_number: "2",
    erection_area: "Area B",
    ship_date: null,
    stage_data: null,
    source: "tekla_epm",
    external_ref: null,
    notes: null,
    imported_at: null,
    is_deleted: false,
    ...overrides,
  };
}

describe("ProductionStatusControlCenter Wave 3 layout", () => {
  it("surfaces production attention and missing ship-date evidence", () => {
    const rows = [
      piece({ id: "p1", piece_mark: "B-101", status: "Weld", ship_date: null }),
      piece({ id: "p2", piece_mark: "B-102", status: "Cut", ship_date: "2026-01-01" }),
    ];

    render(
      <ProductionStatusControlCenter
        projectName="BIMC ED"
        pieces={rows}
        filtered={rows}
        search=""
        onSearch={vi.fn()}
        stageFilter="All"
        onStageFilterChange={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
        onImportEpm={vi.fn()}
        selectedIds={new Set()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onClearSelection={vi.fn()}
        onBulkSetStage={vi.fn()}
        bulkPending={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Production Status" })).toBeInTheDocument();
    expect(screen.getByText("Production Attention")).toBeInTheDocument();
    expect(screen.getByText("Missing Ship Date")).toBeInTheDocument();
    expect(screen.getAllByText(/B-101/).length).toBeGreaterThan(0);
  });
});
