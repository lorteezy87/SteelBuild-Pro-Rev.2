// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterView } from "../components";

const sample = {
  id: "wp-1",
  wp_number: "WP-01",
  name: "Area A Main Steel",
  tonnage: 12.4,
  sequence_number: "2",
  material_status: "Ordered",
  _signals: {
    phase: "Fabrication",
    status: "In Progress",
    progress: 55,
    complete: false,
    overdue: false,
    risk: "medium",
    readinessScore: 67,
    hourBurn: 81,
    totalBudgetHours: 100,
    totalActualHours: 81,
    flags: [],
    drawing: {
      linkedCount: 8,
      approvedCount: 8,
      hasAny: true,
      hasApproved: true,
      fabReadyCount: 8,
      blockedCount: 0,
    },
    pieceDriven: true,
    released: true,
    release: null,
    pieces: {
      leafCount: 20,
      onHold: 0,
      notStarted: 2,
      released: 4,
      inFabrication: 5,
      fabricated: 4,
      shipped: 3,
      delivered: 1,
      erected: 1,
    },
  },
} as any;

describe("Work Package register layout", () => {
  it("uses the readiness-first structural steel column hierarchy", () => {
    render(
      <RegisterView
        rows={[sample]}
        selectedWPs={new Set()}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
        onEdit={null}
        onDelete={null}
        sort={{ key: null, direction: "asc" }}
        onSort={vi.fn()}
      />,
    );

    const labels = screen
      .getAllByTestId("wp-register-column")
      .map((node) => node.textContent?.trim());

    expect(labels).toEqual([
      "WP",
      "Description",
      "Sequence",
      "Tons",
      "Pieces",
      "Drawing Status",
      "Material",
      "Fab",
      "Ship",
      "Field",
      "Risk",
    ]);
  });
});
