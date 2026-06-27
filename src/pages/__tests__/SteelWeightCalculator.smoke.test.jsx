// @vitest-environment jsdom

/**
 * Smoke test for SteelWeightCalculator.
 *
 * Covers the load-bearing behavior of the C11 reskin + additions:
 *  1. A W-shape weight computes (W6X9 @ 9.0 lb/ft × 10 ft = 90.00 lb).
 *  2. Cost at $0.85/lb on 1000 lb shows $850.00 (pieceCost engine).
 *  3. The "Copy takeoff (CSV)" button writes CSV containing a data row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import SteelWeightCalculator from "../SteelWeightCalculator";
import { pieceCost } from "@/utils/steelCost";

// sonner toast is a side-effect we don't assert on — stub it.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Calculator-kit CSS imports must not throw under jsdom.
vi.mock("@/components/calculators/calc.css", () => ({}));

describe("SteelWeightCalculator (smoke)", () => {
  let clipboardWrites;

  beforeEach(() => {
    window.localStorage.clear();
    clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn((text) => {
          clipboardWrites.push(text);
          return Promise.resolve();
        }),
      },
    });
  });

  it("computes a W-shape weight (W6X9 @ 10 ft = 90.00 lb)", () => {
    render(<SteelWeightCalculator />);

    // Default family is W-Shape; default designation is the first row (W6X9).
    // Switch the length mode to plain decimal feet for a clean number.
    fireEvent.click(screen.getByText("DECIMAL FT"));
    fireEvent.change(screen.getByPlaceholderText("e.g. 12.5"), {
      target: { value: "10" },
    });

    fireEvent.click(screen.getByLabelText("Calculate weight"));

    // 9.0 lb/ft × 10 ft × 1 = 90.00 lb total. The total renders in both
    // the LCD display and the "Total weight" result row.
    expect(screen.getAllByText("90.00 lb").length).toBeGreaterThanOrEqual(1);
    // lb/ft reference echoes the AISC table value.
    expect(screen.getByText("9.000 lb/ft")).toBeInTheDocument();
  });

  it("pieceCost: $0.85/lb on 1000 lb is $850", () => {
    expect(pieceCost(1000, 0.85, "/lb")).toBeCloseTo(850, 5);
  });

  it("shows cost in the result card when a rate is entered", () => {
    render(<SteelWeightCalculator />);

    fireEvent.click(screen.getByText("DECIMAL FT"));
    fireEvent.change(screen.getByPlaceholderText("e.g. 12.5"), {
      target: { value: "10" },
    });
    // Rate $1/lb → 90 lb × $1 = $90.00 cost on the result card.
    fireEvent.change(screen.getByLabelText("Material rate"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByLabelText("Calculate weight"));

    expect(screen.getByText("$90.00")).toBeInTheDocument();
  });

  it("copies a CSV takeoff containing a data row", async () => {
    render(<SteelWeightCalculator />);

    fireEvent.click(screen.getByText("DECIMAL FT"));
    fireEvent.change(screen.getByPlaceholderText("e.g. 12.5"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByLabelText("Calculate weight"));

    // Add the computed piece to the running total.
    fireEvent.click(screen.getByLabelText("Add to running total"));

    // Copy the takeoff CSV.
    fireEvent.click(screen.getByText(/Copy takeoff \(CSV\)/i));

    // Wait a tick for the clipboard promise.
    await Promise.resolve();

    expect(clipboardWrites.length).toBeGreaterThan(0);
    const csv = clipboardWrites[clipboardWrites.length - 1];
    const lines = csv.split("\n");
    // Header + at least one data row.
    expect(lines[0]).toBe("shape,qty,length,lb_per_ft,weight_lb,cost");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // The data row carries the W6X9 shape + the 90.00 lb weight.
    expect(lines[1]).toContain("W6X9");
    expect(lines[1]).toContain("90.00");
  });
});
