// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatTile from "@/components/desktop/module/StatTile";

describe("StatTile", () => {
  it("renders label and value", () => {
    const { getByText } = render(<StatTile label="Open RFIs" value={14} />);
    expect(getByText("Open RFIs")).toBeTruthy();
    expect(getByText("14")).toBeTruthy();
  });
  it("applies the tone modifier class", () => {
    const { container } = render(<StatTile label="Overdue" value={3} tone="danger" />);
    expect(container.querySelector(".desk-stat--danger")).toBeTruthy();
  });
});
