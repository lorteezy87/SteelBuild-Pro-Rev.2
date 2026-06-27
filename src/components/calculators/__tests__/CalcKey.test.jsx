// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import CalcKey from "../CalcKey";

describe("CalcKey", () => {
  it("renders the label '7'", () => {
    render(<CalcKey label="7" />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("fires onPress when clicked", () => {
    const onPress = vi.fn();
    render(<CalcKey label="7" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows secondary label 'q' when given", () => {
    render(<CalcKey label="7" secondary="q" />);
    expect(screen.getByText("q")).toBeInTheDocument();
  });

  it("variant 'op' applies sbd-calc-key--op class", () => {
    render(<CalcKey label="+" variant="op" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("sbd-calc-key--op");
  });

  it("disabled button does not fire onPress", () => {
    const onPress = vi.fn();
    render(<CalcKey label="7" onPress={onPress} disabled />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPress).not.toHaveBeenCalled();
  });
});
