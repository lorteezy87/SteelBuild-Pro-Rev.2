// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkPackageDetailModal from "../WorkPackageDetailModal";

const sampleWp = {
  id: "wp-1",
  wp_number: "WP-003",
  name: "Panel Misc. - Bldg. 1",
  phase: "Detailing",
  status: "In Progress",
  tonnage: 12.5,
  percent_complete: 80,
  crew: "SOL",
  linked_drawing_ids: "dwg-1",
};

describe("WorkPackageDetailModal", () => {
  it("renders the overview drawer for a clicked work package", () => {
    expect(() => {
      render(
        <WorkPackageDetailModal
          wp={sampleWp}
          drawings={[
            {
              id: "dwg-1",
              sheet_number: "S-201",
              title: "Framing Plan",
              stage: "IFC",
              revision_number: "1",
            },
          ]}
          onClose={vi.fn()}
          onEdit={vi.fn()}
        />
      );
    }).not.toThrow();

    expect(screen.getByText("WP-003")).toBeInTheDocument();
    expect(screen.getByText("Panel Misc. - Bldg. 1")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });
});
