// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ModuleTabs from "@/components/desktop/module/ModuleTabs";

const TABS = [
  { id: "drawings", label: "Drawings" },
  { id: "submittals", label: "Submittals" },
];

function wrap(ui, initial = "/") {
  return render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);
}

describe("ModuleTabs", () => {
  it("defaults active to the first tab when no param", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />);
    expect(getByText("Drawings").getAttribute("aria-current")).toBe("page");
  });
  it("reflects the active tab from the query param", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />, "/?x_tab=submittals");
    expect(getByText("Submittals").getAttribute("aria-current")).toBe("page");
  });
  it("sets the query param on click", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />);
    fireEvent.click(getByText("Submittals"));
    expect(getByText("Submittals").getAttribute("aria-current")).toBe("page");
  });
});
