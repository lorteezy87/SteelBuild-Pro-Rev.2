// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useProjectContext: vi.fn(),
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: mocks.useProjectContext,
}));

import PortfolioGantt from "@/pages/PortfolioGantt";

const PROJECTS = [
  {
    id: "p1",
    name: "Desert Ridge Tower",
    project_number: "24-001",
    phase: "Fabrication",
    health_status: "On Track",
    start_date: "2026-01-05",
    target_completion_date: "2026-06-30",
    forecast_completion_date: "2026-06-30",
  },
  {
    id: "p2",
    name: "Civic Center Annex",
    project_number: "24-014",
    phase: "Detailing",
    health_status: "At Risk",
    start_date: "2026-03-01",
    target_completion_date: "2026-05-15",
    forecast_completion_date: "2026-07-01", // slips past target
  },
  {
    id: "p3",
    name: "Pending Award Job",
    project_number: "24-099",
    phase: "Pre-Construction",
    health_status: "Watch",
    start_date: null,
    target_completion_date: null,
    forecast_completion_date: null,
  },
];

function renderWith(projects = PROJECTS, extra = {}) {
  mocks.useProjectContext.mockReturnValue({
    projects,
    setActiveProject: vi.fn(),
    loading: false,
    projectLoadError: null,
    ...extra,
  });
  return render(
    <MemoryRouter>
      <PortfolioGantt />
    </MemoryRouter>
  );
}

describe("PortfolioGantt", () => {
  it("renders the portfolio timeline with all projects", () => {
    renderWith();
    expect(screen.getByText("Portfolio Schedule")).toBeInTheDocument();
    expect(screen.getByText("Desert Ridge Tower")).toBeInTheDocument();
    expect(screen.getByText("Civic Center Annex")).toBeInTheDocument();
    expect(screen.getByText("Pending Award Job")).toBeInTheDocument();
  });

  it("surfaces projects without dates as unscheduled instead of hiding them", () => {
    renderWith();
    expect(screen.getByText(/Unscheduled — no start \/ target dates/i)).toBeInTheDocument();
  });

  it("filters by health when a chip is toggled", () => {
    renderWith();
    fireEvent.click(screen.getByRole("button", { name: "AT RISK" }));
    expect(screen.getByText("Civic Center Annex")).toBeInTheDocument();
    expect(screen.queryByText("Desert Ridge Tower")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no projects", () => {
    renderWith([]);
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });
});
