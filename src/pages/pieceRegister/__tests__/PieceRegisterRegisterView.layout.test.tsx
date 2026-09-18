// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceRegisterRegisterView } from "../PieceRegisterRegisterView";
import { EMPTY_PIECE_REGISTER_FILTERS } from "../registerHelpers";

describe("PieceRegisterRegisterView operational layout", () => {
  it("uses the approved production-control column hierarchy", () => {
    render(
      <PieceRegisterRegisterView
        filters={EMPTY_PIECE_REGISTER_FILTERS}
        updateRegisterFilters={vi.fn()}
        workPackages={[]}
        profiles={[]}
        grades={[]}
        lifecycles={[]}
        sources={[]}
        attentionFocus={null}
        clearRegisterFilters={vi.fn()}
        filteredRows={[]}
        displayRows={[]}
        registerSort={{ key: "work_package", direction: "asc" }}
        setRegisterSort={vi.fn()}
        selectedPieceIds={new Set()}
        setSelectedPieceIds={vi.fn()}
        canBulkUpdate
        canArchive
        bulkPending={false}
        onBulkAssign={vi.fn()}
        onBulkUnassign={vi.fn()}
        onBulkAttrs={vi.fn()}
        onBulkHold={vi.fn()}
        onArchive={vi.fn()}
        selectedPieceId={null}
        selectedPieceThread={null}
        intelligenceLoading={false}
        intelligenceError={null}
        onRetryIntelligence={vi.fn()}
        onClosePiece={vi.fn()}
        onOpenRelationships={vi.fn()}
        onOpenRelease={vi.fn()}
        allFilteredSelected={false}
        toggleAllFiltered={vi.fn()}
        piecesLoading={false}
        piecesError={null}
        onRetryPieces={vi.fn()}
        onGoImport={vi.fn()}
      />,
    );

    const headers = screen.getAllByRole("columnheader").map((cell) =>
      cell.textContent?.replace(/\s+/g, " ").trim(),
    );

    expect(headers).toEqual([
      "",
      "Piece Mark",
      "Qty",
      "Main Mark",
      "Shape",
      "Weight",
      "WP",
      "Sequence",
      "Drawing",
      "Release",
      "Fab",
      "Load",
      "Ship",
      "Erect",
    ]);
  });
});
