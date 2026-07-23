// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceAttentionPanel } from "../PieceAttentionPanel";
import { PieceControlModeBadge } from "../PieceControlModeBadge";
import { PieceLifecycleStrip } from "../PieceLifecycleStrip";

describe("Piece Control presentation components", () => {
  it("shows the authority explanation beside the mode", () => {
    render(
      <PieceControlModeBadge
        presentation={{
          label: "Shadow review",
          tone: "warn",
          authority: "Existing production records remain authoritative while the register is compared.",
        }}
      />,
    );
    expect(screen.getByText("Shadow review")).toBeInTheDocument();
    expect(screen.getByText(/remain authoritative/i)).toBeInTheDocument();
  });

  it("makes lifecycle segments actionable when a handler is provided", () => {
    const onSelect = vi.fn();
    render(
      <PieceLifecycleStrip
        totalPieces={4}
        onSelect={onSelect}
        items={[
          { key: "not_started", label: "Not Started", pieces: 3, tons: 1.5 },
          { key: "fabricated", label: "Fabricated", pieces: 1, tons: 0.5 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fabricated 1 pieces/i }));
    expect(onSelect).toHaveBeenCalledWith("fabricated");
  });

  it("renders a zero-count lifecycle stage with no progress width", () => {
    render(
      <PieceLifecycleStrip
        totalPieces={4}
        items={[
          { key: "not_started", label: "Not Started", pieces: 4, tons: 2 },
          { key: "fabricated", label: "Fabricated", pieces: 0, tons: 0 },
        ]}
      />,
    );

    const fabricatedStage = screen.getByText("Fabricated").closest(".piece-lifecycle__item");
    const fabricatedProgress = fabricatedStage?.querySelector(".piece-lifecycle__track > span");
    expect(fabricatedProgress).toHaveStyle({ width: "0%" });
  });

  it("collapses an empty attention list to one concise state", () => {
    render(<PieceAttentionPanel items={[]} emptyMessage="No piece exceptions." />);
    expect(screen.getByText("No piece exceptions.")).toBeInTheDocument();
  });
});
