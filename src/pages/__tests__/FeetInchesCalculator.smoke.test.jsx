// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import FeetInchesCalculator from "../FeetInchesCalculator";

// calc.css uses CSS custom properties jsdom can't parse; stub the import.
vi.mock("@/components/calculators/calc.css", () => ({}));
// sonner toasts are noise in a smoke test — stub them out.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Click an on-screen key by its accessible label (aria-label / label).
function press(label) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function displayText() {
  return screen.getByLabelText("Display value").textContent;
}

describe("FeetInchesCalculator (smoke)", () => {
  beforeEach(() => {
    // Persistent tape lives in localStorage — start each test clean.
    window.localStorage.clear();
  });

  it("adds 12'6\" + 3'8\" → 16'-2\"", () => {
    render(<FeetInchesCalculator />);
    const entry = screen.getByPlaceholderText(/e\.g\. 12/);
    fireEvent.change(entry, { target: { value: "12'6\"" } });
    press("Add");
    fireEvent.change(entry, { target: { value: "3'8\"" } });
    press("Equals");
    expect(displayText()).toBe("16'-2\"");
  });

  it("cut-list: 10ft × 4 in 20ft stock → 2 sticks / 0.0% waste", () => {
    render(<FeetInchesCalculator />);

    // Open the collapsible optimizer panel (name also includes the ▼ glyph).
    fireEvent.click(
      screen.getByRole("button", { name: /Cut-List & Stock Optimizer/ }),
    );

    fireEvent.change(screen.getByPlaceholderText(/8'-4 1\/2/), {
      target: { value: "10'" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. 12"), {
      target: { value: "4" },
    });
    // Stock preset 20' is the default; click it to be explicit.
    press("20'");

    // Sticks needed → 2
    const sticksLabel = screen.getByText("Sticks needed");
    expect(sticksLabel.parentElement.textContent).toContain("2");

    // Waste % → 0.0%
    const wasteLabel = screen.getByText("Waste %");
    expect(wasteLabel.parentElement.textContent).toContain("0.0%");
  });
});
