// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PieceDigitalThreadModel } from "@/lib/pieceControl/pieceIntelligenceTypes";
import { PieceDigitalThread } from "../PieceDigitalThread";

function thread(
  patch: Partial<PieceDigitalThreadModel> = {},
): PieceDigitalThreadModel {
  return {
    pieceId: "p1",
    identity: {
      availability: "available",
      markAndLot: "B12 · L2",
      facts: [
        { label: "Piece mark", value: "B12" },
        { label: "Lot", value: "L2" },
      ],
    },
    modelAndDrawing: {
      availability: "available",
      facts: [{ label: "Sheets", value: "E502" }],
    },
    commercial: {
      availability: "available",
      facts: [
        { label: "Change exposure", value: "Change impact recorded" },
        { label: "Change order", value: "CO record not linked" },
      ],
    },
    productionAndLogistics: {
      availability: "available",
      facts: [{ label: "Lifecycle", value: "In fabrication" }],
    },
    history: {
      availability: "available",
      facts: [{ label: "2026-08-09T12:00:00Z", value: "Station advanced" }],
    },
    ...patch,
  };
}

describe("PieceDigitalThread", () => {
  it("exposes the selected piece as a named, bounded detail panel", () => {
    render(<PieceDigitalThread thread={thread()} onClose={vi.fn()} />);

    const panel = screen.getByRole("dialog", { name: "Piece digital thread: B12 · L2" });
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel).toHaveClass("piece-digital-thread");
  });

  it("renders the five ordered sections and unlinked change-order truth", () => {
    render(<PieceDigitalThread thread={thread()} onClose={vi.fn()} />);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Identity",
      "Model & drawing",
      "Commercial & constraints",
      "Production & logistics",
      "History",
    ]);
    expect(screen.getByText("CO record not linked")).toBeInTheDocument();
    expect(screen.queryByText(/CO-\d+/i)).not.toBeInTheDocument();
  });

  it("shows unavailable anatomy and suppresses facts from that source", () => {
    render(
      <PieceDigitalThread
        thread={thread({
          modelAndDrawing: {
            availability: "unavailable",
            facts: [{ label: "Approval evidence", value: "Recorded" }],
          },
        })}
        onClose={vi.fn()}
      />,
    );

    const section = screen.getByRole("region", { name: "Model & drawing" });
    expect(section).toHaveTextContent("This source is unavailable.");
    expect(section).toHaveTextContent("No decision should be made from missing evidence.");
    expect(section).not.toHaveTextContent("Approval evidence");
    expect(section).not.toHaveTextContent("Recorded");
  });

  it("delegates close, relationship, and release navigation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenRelationships = vi.fn();
    const onOpenRelease = vi.fn();
    render(
      <PieceDigitalThread
        thread={thread()}
        onClose={onClose}
        onOpenRelationships={onOpenRelationships}
        onOpenRelease={onOpenRelease}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Open Lots & links" }));
    await user.click(screen.getByRole("button", { name: "Open fabrication release" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenRelationships).toHaveBeenCalledTimes(1);
    expect(onOpenRelease).toHaveBeenCalledTimes(1);
  });
});
