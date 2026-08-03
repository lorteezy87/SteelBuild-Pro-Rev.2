// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PlannerShell from "../PlannerShell";
import { PLANNER_NAV_GROUPS } from "../plannerNav";

describe("PlannerShell", () => {
  it("renders every approved Planner navigation label with the active route announced", () => {
    render(
      <MemoryRouter initialEntries={["/48-hour-gate"]}>
        <PlannerShell>
          <h2>48-Hour Gate</h2>
        </PlannerShell>
      </MemoryRouter>,
    );

    for (const group of PLANNER_NAV_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
      for (const label of group.items) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
    }

    expect(screen.getByRole("link", { name: "48-Hour Gate" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the reference brand and subtitle in the fixed Planner chrome", () => {
    render(
      <MemoryRouter>
        <PlannerShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "STEELBUILD-PLANNER" })).toBeInTheDocument();
    expect(screen.getByText("Construction Action & Lookahead Control")).toBeInTheDocument();
    expect(screen.getByLabelText("SteelBuild Planner home").querySelector(".planner-brand__identity")?.tagName).toBe("DIV");
  });
});
