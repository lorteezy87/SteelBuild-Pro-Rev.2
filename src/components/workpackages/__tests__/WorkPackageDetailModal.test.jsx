// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkPackageDetailModal from "../WorkPackageDetailModal";

vi.mock("@/components/pieceControl/PieceRelationshipManager", () => ({
  default: () => <div>Relationship controls</div>,
}));

vi.mock("@/components/pieceControl/PieceProductionControl", () => ({
  PieceProductionControl: () => <div>Production controls</div>,
}));

vi.mock("@/components/pieceControl/PieceLogisticsControl", () => ({
  PieceLogisticsControl: () => <div>Logistics controls</div>,
}));

vi.mock("@/components/pieceControl/CanonicalFabReleasePanel", () => ({
  default: () => <div>Release controls</div>,
}));

const sampleWp = {
  id: "wp-1",
  project_id: "project-1",
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

  it("mounts Piece Control in a command-skinned compact drawer", () => {
    render(
      <WorkPackageDetailModal
        wp={sampleWp}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "piece control" }));

    const drawerSurface = screen
      .getByText("Production controls")
      .closest(".work-package-piece-control-drawer");
    expect(drawerSurface).toHaveAttribute("data-skin", "command");

    const componentSource = readFileSync(
      resolve("src/components/workpackages/WorkPackageDetailModal.jsx"),
      "utf8",
    );
    const styleSource = readFileSync(
      resolve("src/styles/piece-control-command.css"),
      "utf8",
    );

    expect(componentSource).toContain('import "@/styles/piece-control-command.css"');
    expect(styleSource).toMatch(
      /\.work-package-piece-control-drawer\s+\.piece-production-controls,[\s\S]*?\.work-package-piece-control-drawer\s+\.piece-logistics-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(styleSource).toMatch(
      /\.work-package-piece-control-drawer\s+\.piece-operations__head,[\s\S]*?\{[^}]*flex-direction:\s*column/,
    );
  });
});
