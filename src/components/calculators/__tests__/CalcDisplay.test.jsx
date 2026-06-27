// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import CalcDisplay from "../CalcDisplay";

// calc.css uses CSS custom properties; jsdom doesn't parse them,
// but the import must not throw — stub it out.
vi.mock("../calc.css", () => ({}));

describe("CalcDisplay", () => {
  it("renders the primary value", () => {
    render(<CalcDisplay value="123.45" />);
    expect(screen.getByText("123.45")).toBeInTheDocument();
  });

  it("renders the aux line when aux is provided", () => {
    render(<CalcDisplay value="0" aux="12 + 34 =" />);
    expect(screen.getByText("12 + 34 =")).toBeInTheDocument();
  });

  it("does not render the aux line when aux is empty (default)", () => {
    render(<CalcDisplay value="0" />);
    expect(screen.queryByLabelText("Expression")).not.toBeInTheDocument();
  });

  it("shows memory chip 'M' when memoryActive is true", () => {
    render(<CalcDisplay value="0" memoryActive />);
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("does not show memory chip when memoryActive is false (default)", () => {
    render(<CalcDisplay value="0" />);
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("calls onCopy when the value element is clicked", () => {
    const onCopy = vi.fn();
    render(<CalcDisplay value="42" onCopy={onCopy} />);
    fireEvent.click(screen.getByLabelText("Display value"));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("does not throw when value is clicked without onCopy", () => {
    render(<CalcDisplay value="42" />);
    expect(() =>
      fireEvent.click(screen.getByText("42"))
    ).not.toThrow();
  });
});
