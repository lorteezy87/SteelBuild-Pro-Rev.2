// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectContextBar } from "../ProjectContextBar";

describe("ProjectContextBar", () => {
  it("shows project identity and optional project number", () => {
    render(
      <ProjectContextBar
        project={{ name: "BIMC ED Expansion", project_number: "26179" }}
        showProjectNumber
      />,
    );

    expect(screen.getByText("BIMC ED Expansion")).toBeInTheDocument();
    expect(screen.getByText("26179")).toBeInTheDocument();
  });

  it("uses Portfolio when no active project exists without inventing metadata", () => {
    render(<ProjectContextBar project={null} showProjectNumber />);

    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.queryByTestId("project-number")).not.toBeInTheDocument();
  });

  it("renders global-control slots without owning their behavior", () => {
    render(
      <ProjectContextBar
        project={{ name: "Skyport" }}
        controls={<button type="button">Search</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});
