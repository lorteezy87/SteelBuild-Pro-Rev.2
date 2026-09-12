// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { matrixFilterSearch, useMatrixFilter } from "../useMatrixFilter";

afterEach(cleanup);

function Harness() {
  const { filter, setFilter } = useMatrixFilter();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <output data-testid="filter">{filter ?? "none"}</output>
      <button type="button" onClick={() => setFilter("hold")}>Hold</button>
      <button type="button" onClick={() => setFilter("nosub")}>No submittal</button>
      <button type="button" onClick={() => navigate("/away")}>Away</button>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

describe("matrixFilterSearch", () => {
  it("changes only matrix_filter and preserves unrelated hub state", () => {
    expect(matrixFilterSearch("hub_tab=matrix&recordId=abc", "hold").toString())
      .toBe("hub_tab=matrix&recordId=abc&matrix_filter=hold");
    expect(matrixFilterSearch("hub_tab=matrix&matrix_filter=hold", null).toString())
      .toBe("hub_tab=matrix");
  });
});

describe("useMatrixFilter", () => {
  it("replaces filter toggles instead of adding Back-history entries", () => {
    render(
      <MemoryRouter
        initialEntries={["/origin", "/DrawingSubmittalHub?hub_tab=matrix"]}
        initialIndex={1}
      >
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    fireEvent.click(screen.getByRole("button", { name: "No submittal" }));
    expect(screen.getByTestId("filter")).toHaveTextContent("nosub");

    fireEvent.click(screen.getByRole("button", { name: "Away" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location"))
      .toHaveTextContent("/DrawingSubmittalHub?hub_tab=matrix&matrix_filter=nosub");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/origin");
  });
});
