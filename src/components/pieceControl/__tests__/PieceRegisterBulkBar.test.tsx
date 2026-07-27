// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PieceRegisterBulkBar from "../PieceRegisterBulkBar";

describe("PieceRegisterBulkBar", () => {
  const workPackages = [
    { id: "wp-1", wp_number: "WP-001", name: "Embeds" },
    { id: "wp-2", wp_number: "WP-002", name: "Beams" },
  ];

  it("exposes assign, attribute, and hold controls for selected pieces", () => {
    const onAssign = vi.fn();
    const onUnassign = vi.fn();
    const onApplyAttributes = vi.fn();
    const onHold = vi.fn();
    const onClearHold = vi.fn();
    const onArchive = vi.fn();

    render(
      <PieceRegisterBulkBar
        selectedCount={3}
        workPackages={workPackages}
        canBulkUpdate
        canArchive
        pending={false}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onApplyAttributes={onApplyAttributes}
        onHold={onHold}
        onClearHold={onClearHold}
        onArchive={onArchive}
      />,
    );

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Assign work package/i), {
      target: { value: "wp-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Assign WP/i }));
    expect(onAssign).toHaveBeenCalledWith("wp-1");

    fireEvent.click(screen.getByLabelText(/Update sequence/i));
    fireEvent.change(screen.getByLabelText(/^Sequence$/i), {
      target: { value: "22" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply fields/i }));
    expect(onApplyAttributes).toHaveBeenCalledWith({
      updateSequence: true,
      updateArea: false,
      sequenceNumber: "22",
      erectionArea: "",
    });

    fireEvent.change(screen.getByLabelText(/Hold reason/i), {
      target: { value: "Waiting on IFC" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Hold$/i }));
    expect(onHold).toHaveBeenCalledWith("Waiting on IFC");

    fireEvent.click(screen.getByRole("button", { name: /Clear hold/i }));
    expect(onClearHold).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Archive selected/i }));
    expect(onArchive).toHaveBeenCalled();
  });

  it("disables archive when the user is not an admin", () => {
    render(
      <PieceRegisterBulkBar
        selectedCount={1}
        workPackages={[]}
        canBulkUpdate
        canArchive={false}
        pending={false}
        onAssign={vi.fn()}
        onUnassign={vi.fn()}
        onApplyAttributes={vi.fn()}
        onHold={vi.fn()}
        onClearHold={vi.fn()}
        onArchive={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Archive selected/i }),
    ).toBeDisabled();
  });
});
