// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import RegularCalculator from "../RegularCalculator";

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

describe("RegularCalculator (smoke)", () => {
  beforeEach(() => {
    // Persistent tape lives in localStorage — start each test clean.
    window.localStorage.clear();
  });

  it("computes 7 × 8 = 56", () => {
    render(<RegularCalculator />);
    press("7");
    press("Multiply");
    press("8");
    press("Equals");
    expect(displayText()).toBe("56");
  });

  it("M+ then MR recalls the stored value", () => {
    render(<RegularCalculator />);
    // Build a value, store it to memory, clear, then recall.
    press("7");
    press("Multiply");
    press("8");
    press("Equals"); // display = 56, accum = 56
    press("Memory add"); // M = 56
    press("Clear all"); // display back to 0
    expect(displayText()).toBe("0");
    press("Memory recall"); // recalls 56 into entry
    expect(displayText()).toBe("56");
  });
});
