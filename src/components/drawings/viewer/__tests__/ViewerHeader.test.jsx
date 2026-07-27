// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ role: "admin", isAdmin: false }),
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
