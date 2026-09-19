// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ role: "admin", isAdmin: true }),
}));

import ViewerHeader from "../ViewerHeader";

describe("ViewerHeader drawing-set lock controls", () => {
  it("lets a project admin start the required-reason unlock flow", () => {
    render(
      <MemoryRouter>
        <ViewerHeader
          projectName="Test Project"
          activeDrawing={{ id: "drawing-1", drawing_set_id: "set-1", sheet_number: "S-1" }}
          drawingSet={{ id: "set-1", set_name: "Structural", is_locked: true }}
          onUnlock={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });
});

describe("ViewerHeader revision compare affordance", () => {
  const drawing = { id: "drawing-1", drawing_set_id: "set-1", sheet_number: "S-301", revision_number: 2 };
  const set = { id: "set-1", set_name: "Structural" };

  function renderHeader(props = {}) {
    return render(
      <MemoryRouter>
        <ViewerHeader projectName="Test Project" activeDrawing={drawing} drawingSet={set} {...props} />
      </MemoryRouter>,
    );
  }

  it("opens compare from the Revision tile", () => {
    const onCompareRevisions = vi.fn();
    renderHeader({ onCompareRevisions });

    const tile = screen.getByTitle("Compare this sheet against a previous revision");
    expect(tile).toHaveTextContent("R2");

    fireEvent.click(tile);
    expect(onCompareRevisions).toHaveBeenCalledTimes(1);
  });

  // Without a handler the tile must stay the plain block it has always been,
  // or every other viewer surface rendering this header gains a dead button.
  it("renders the Revision tile as static when no handler is given", () => {
    renderHeader();

    expect(screen.queryByTitle("Compare this sheet against a previous revision")).toBeNull();
    expect(screen.getByText("R2")).toBeInTheDocument();
  });

  // The modal keys every query off drawing.id, so the affordance must not be
  // offered before a sheet is open.
  it("does not offer compare when no sheet is open", () => {
    const onCompareRevisions = vi.fn();
    render(
      <MemoryRouter>
        <ViewerHeader projectName="Test Project" activeDrawing={null} drawingSet={set} onCompareRevisions={onCompareRevisions} />
      </MemoryRouter>,
    );

    expect(screen.queryByTitle("Compare this sheet against a previous revision")).toBeNull();
  });
});
