// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PieceIntelligenceModel } from "@/lib/pieceControl/pieceIntelligenceTypes";
import { PieceRevisionImpactView } from "../PieceRevisionImpactView";

function model(
  patch: Partial<PieceIntelligenceModel> = {},
): PieceIntelligenceModel {
  return {
    verification: "verified",
    unavailableSourceWarnings: [],
    revisions: [
      {
        revisionId: "r4",
        drawingId: "drawing-1",
        drawingSetId: "set-1",
        sheetNumber: "E502",
        revisionCode: "4",
        affectedPieceIds: ["p1"],
        affectedWorkPackageIds: ["wp-1"],
        verification: "verified",
        exposure: {
          not_started: 0,
          released: 0,
          in_fabrication: 1,
          fabricated: 0,
          shipped: 0,
          delivered: 0,
          erected: 0,
        },
        heldCount: 1,
        openImpactCount: 1,
        openRfiCount: 0,
      },
    ],
    attention: [
      {
        pieceId: "p1",
        revisionId: "r4",
        priorityTier: 4,
        markAndLot: "B12 · L2",
        workPackageLabel: "WP-1",
        lifecycle: "in_fabrication",
        lifecycleLabel: "In fabrication",
        fieldNeededDate: null,
        fieldRisk: false,
        onHold: true,
        fabBlocked: false,
        reason: "Revision exposure during fabrication",
      },
    ],
    metrics: {
      affectedPieces: 1,
      blockedPieces: 1,
      fieldRiskPieces: 0,
      linkRequiredRevisions: 0,
      nextRelease: null,
    },
    ...patch,
  };
}

describe("PieceRevisionImpactView", () => {
  it("selects a revision and exposes its exact affected pieces", async () => {
    const user = userEvent.setup();
    const onSelectRevision = vi.fn();
    const onSelectPiece = vi.fn();
    const { rerender } = render(
      <PieceRevisionImpactView
        model={model()}
        selectedRevisionId={null}
        onSelectRevision={onSelectRevision}
        onSelectPiece={onSelectPiece}
      />,
    );

    const revisionButton = screen.getByRole("button", {
      name: /E502 revision 4/i,
    });
    expect(revisionButton).toHaveAccessibleName(
      "E502 revision 4, 1 affected piece, Verified exact links",
    );
    expect(revisionButton).toHaveAttribute("aria-pressed", "false");
    await user.click(revisionButton);
    expect(onSelectRevision).toHaveBeenCalledWith("r4");

    rerender(
      <PieceRevisionImpactView
        model={model()}
        selectedRevisionId="r4"
        onSelectRevision={onSelectRevision}
        onSelectPiece={onSelectPiece}
      />,
    );

    expect(revisionButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table", { name: "Affected pieces" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open B12 · L2/i }));
    expect(onSelectPiece).toHaveBeenCalledWith("p1");
  });

  it("renders link required instead of reporting zero affected pieces", () => {
    const linkRequired = model({
      verification: "link_required",
      revisions: [
        {
          ...model().revisions[0],
          affectedPieceIds: [],
          affectedWorkPackageIds: [],
          verification: "link_required",
          exposure: {
            not_started: 0,
            released: 0,
            in_fabrication: 0,
            fabricated: 0,
            shipped: 0,
            delivered: 0,
            erected: 0,
          },
          heldCount: 0,
          openImpactCount: 0,
          openRfiCount: 0,
        },
      ],
      attention: [],
      metrics: {
        ...model().metrics,
        affectedPieces: 0,
        blockedPieces: 0,
        linkRequiredRevisions: 1,
      },
    });

    render(
      <PieceRevisionImpactView
        model={linkRequired}
        selectedRevisionId="r4"
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByText("Piece links required")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "E502 revision 4, Piece links required, Relationship repair required",
    })).toBeInTheDocument();
    expect(screen.queryByText(/0 affected pieces/i)).not.toBeInTheDocument();
  });

  it("labels empty revision evidence unavailable when its source is unavailable", () => {
    render(
      <PieceRevisionImpactView
        model={model({
          verification: "partial",
          unavailableSourceWarnings: [
            { source: "relationships", reason: null },
          ],
          revisions: [],
          attention: [],
        })}
        selectedRevisionId="r4"
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByText("Revision evidence unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No current drawing revisions are available for review."))
      .not.toBeInTheDocument();
  });

  it("renders impact count unavailable instead of zero when impacts are unavailable", () => {
    render(
      <PieceRevisionImpactView
        model={model({
          verification: "partial",
          unavailableSourceWarnings: [
            { source: "impacts", reason: null },
          ],
          revisions: [
            {
              ...model().revisions[0],
              verification: "partial",
              openImpactCount: 0,
            },
          ],
        })}
        selectedRevisionId="r4"
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByText("Impact count unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0 open impacts/i)).not.toBeInTheDocument();
  });

  it("renders RFI count unavailable instead of zero when RFIs are unavailable", () => {
    render(
      <PieceRevisionImpactView
        model={model({
          verification: "partial",
          unavailableSourceWarnings: [
            { source: "rfis", reason: null },
          ],
          revisions: [
            {
              ...model().revisions[0],
              verification: "partial",
              openRfiCount: 0,
            },
          ],
        })}
        selectedRevisionId="r4"
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByText("RFI count unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0 open RFIs/i)).not.toBeInTheDocument();
  });

  it("announces unavailable evidence without converting it into a safe result", () => {
    render(
      <PieceRevisionImpactView
        model={model({
          verification: "partial",
          unavailableSourceWarnings: [
            { source: "approvals", reason: null },
            { source: "rfis", reason: null },
          ],
        })}
        selectedRevisionId={null}
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Approval evidence and RFI evidence are unavailable",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Counts and decisions remain unverified",
    );
  });

  it("does not render stale affected-piece counts when relationships are unavailable", () => {
    render(
      <PieceRevisionImpactView
        model={model({
          verification: "partial",
          unavailableSourceWarnings: [
            { source: "relationships", reason: null },
          ],
          revisions: [
            { ...model().revisions[0], verification: "partial" },
          ],
        })}
        selectedRevisionId="r4"
        onSelectRevision={vi.fn()}
        onSelectPiece={vi.fn()}
      />,
    );

    expect(screen.getByText("Piece relationships unavailable")).toBeInTheDocument();
    expect(screen.queryByText("1 affected piece")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Affected pieces" }))
      .not.toBeInTheDocument();
  });
});
