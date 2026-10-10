// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PieceImpactPanel } from "../PieceImpactPanel";

describe("PieceImpactPanel release evidence", () => {
  it("keeps a clear drawing-stage check separate from fabrication authorization", () => {
    render(
      <MemoryRouter>
        <PieceImpactPanel impact={{
          pieceId: "piece-1",
          pieceMark: "B-204",
          lifecycleStatus: "not_started",
          onHold: false,
          governingDrawing: null,
          governingRevisionCode: "3",
          workflowStage: "IFC",
          releaseReady: true,
          releaseBlockReason: null,
          unresolvedRequiredComments: 0,
          flags: [],
        }} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/release-ready/i)).not.toBeInTheDocument();
    expect(screen.getByText(/fabrication release not verified/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open server fab release check/i }))
      .toHaveAttribute("href", "/FabRelease");
  });
});
