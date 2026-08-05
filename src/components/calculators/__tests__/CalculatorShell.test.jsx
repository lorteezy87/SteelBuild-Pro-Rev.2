// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import CalculatorShell from "../CalculatorShell";

const tools = [
  { id: "rigging", label: "Rigging" },
  { id: "steel", label: "Steel Weight" },
  { id: "bend", label: "Bend Allowance" },
];

describe("CalculatorShell", () => {
  it("renders all tool labels in the rail", () => {
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={() => {}}>
        <p>body</p>
      </CalculatorShell>
    );
    expect(screen.getByText("Rigging")).toBeInTheDocument();
    expect(screen.getByText("Steel Weight")).toBeInTheDocument();
    expect(screen.getByText("Bend Allowance")).toBeInTheDocument();
  });

  it("clicking a tool button calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={onSelect}>
        <p>body</p>
      </CalculatorShell>
    );
    fireEvent.click(screen.getByText("Steel Weight"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("steel");
  });

  it("the active tool button has aria-pressed='true'", () => {
    render(
      <CalculatorShell tools={tools} activeTool="steel" onSelect={() => {}}>
        <p>body</p>
      </CalculatorShell>
    );
    const activeBtn = screen.getByText("Steel Weight").closest("button");
    expect(activeBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("inactive tool buttons have aria-pressed='false'", () => {
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={() => {}}>
        <p>body</p>
      </CalculatorShell>
    );
    const inactiveBtn = screen.getByText("Steel Weight").closest("button");
    expect(inactiveBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders children inside the body", () => {
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={() => {}}>
        <p>Calculator content here</p>
      </CalculatorShell>
    );
    expect(screen.getByText("Calculator content here")).toBeInTheDocument();
  });

  it("ArrowRight moves focus to the next tool button", () => {
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={() => {}}>
        <p>body</p>
      </CalculatorShell>
    );
    const riggingBtn = screen.getByText("Rigging").closest("button");
    const steelBtn = screen.getByText("Steel Weight").closest("button");
    riggingBtn.focus();
    fireEvent.keyDown(riggingBtn.parentElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(steelBtn);
  });

  it("ArrowLeft moves focus to the previous tool button", () => {
    render(
      <CalculatorShell tools={tools} activeTool="steel" onSelect={() => {}}>
        <p>body</p>
      </CalculatorShell>
    );
    const steelBtn = screen.getByText("Steel Weight").closest("button");
    const riggingBtn = screen.getByText("Rigging").closest("button");
    steelBtn.focus();
    fireEvent.keyDown(steelBtn.parentElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(riggingBtn);
  });

  it("Enter key on a focused rail button calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(
      <CalculatorShell tools={tools} activeTool="rigging" onSelect={onSelect}>
        <p>body</p>
      </CalculatorShell>
    );
    const bendBtn = screen.getByText("Bend Allowance").closest("button");
    bendBtn.focus();
    fireEvent.keyDown(bendBtn.parentElement, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("bend");
  });
});
