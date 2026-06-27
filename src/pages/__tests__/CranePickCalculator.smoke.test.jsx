// @vitest-environment jsdom

/**
 * Smoke test for CranePickCalculator after the device-kit reskin.
 *
 * Guards the load-bearing behavior that must survive the chrome swap:
 *   - a valid pick (10,000 lb piece, 2 legs, 60°, capacity entered) renders a
 *     capacity utilization % and a per-leg sling tension value,
 *   - the PLANNING-TOOL-ONLY disclaimer text is present on the page.
 *
 * The rigging math itself lives in src/utils/riggingCalculations.js and is
 * covered by its own unit tests; this only checks the page wires it through.
 */

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import CranePickCalculator from "../CranePickCalculator";

// The page toasts via sonner on the "Save to Project" stub; stub it out.
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

describe("CranePickCalculator (device-kit reskin smoke)", () => {
  it("renders the PLANNING TOOL ONLY disclaimer", () => {
    render(<CranePickCalculator />);
    expect(screen.getByText(/PLANNING TOOL ONLY/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not replace an engineered lift plan/i),
    ).toBeInTheDocument();
  });

  it("computes utilization % and per-leg tension for 10,000 lb / 2 legs / 60°", () => {
    const { container } = render(<CranePickCalculator />);

    // Piece weight 10,000 lb.
    const pieceInput = screen.getByPlaceholderText(/12,500/);
    fireEvent.change(pieceInput, { target: { value: "10000" } });

    // Crane capacity at radius (so utilization can compute).
    const capInput = screen.getByPlaceholderText(/180,000/);
    fireEvent.change(capInput, { target: { value: "20000" } });

    // Defaults: 2 legs, 60° sling angle. Total load = 10,000 lb (no rigging).
    // Utilization = 10,000 / 20,000 = 50.0%.
    expect(screen.getByText("50.0%")).toBeInTheDocument();

    // Per-leg tension at 60°: (10,000 / 2) / sin(60°) ≈ 5,773.5 lb.
    // It renders inside the Results "Tension per Leg" row.
    expect(container.textContent).toMatch(/5,773\.5\s*lb/);

    // Sanity: the legs are 2 by default, so the row labels per-leg tension.
    expect(screen.getByText(/Tension per Leg/i)).toBeInTheDocument();
  });
});
