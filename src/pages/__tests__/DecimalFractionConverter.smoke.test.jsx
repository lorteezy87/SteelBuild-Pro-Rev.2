// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import DecimalFractionConverter from "../DecimalFractionConverter";

// sonner toast is fired on copy; stub it so the page mounts cleanly.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("DecimalFractionConverter (smoke)", () => {
  it("renders the Decimal → Fraction panel and converts live", () => {
    render(<DecimalFractionConverter />);

    // Default sub-mode is Dec → Frac.
    expect(screen.getByText("Decimal → Fraction")).toBeInTheDocument();

    // 12.375 decimal feet → 12'-4 1/2" (12 ft + 0.375 ft = 4.5 in).
    const input = screen.getByPlaceholderText("e.g. 12.375");
    fireEvent.change(input, { target: { value: "12.375" } });

    expect(screen.getByText(/12'-4 1\/2"/)).toBeInTheDocument();
  });

  it("Units mode converts 1 in → 25.4 mm", () => {
    render(<DecimalFractionConverter />);

    // Switch to the Units sub-tab.
    fireEvent.click(screen.getByRole("tab", { name: "Units" }));
    expect(screen.getByLabelText("Conversion category")).toBeInTheDocument();

    // Default Length category: from = mm, to = in. Set from→in, to→mm.
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "in" } });
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "mm" } });
    fireEvent.change(screen.getByLabelText("Value to convert"), { target: { value: "1" } });

    // 1 in = 25.4 mm.
    expect(screen.getByLabelText("Converted value")).toHaveTextContent("25.4");
  });
});
