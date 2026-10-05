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
// jsdom has no WebGL; the 3D view is presentation-only and tested separately.
vi.mock("@/components/calculators/CranePick3D", () => ({ default: () => null }));

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

describe("CranePickCalculator (audit fixes + new features)", () => {
  const set = (placeholder, value) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

  // parseFloat("12,500") is 12 — a comma-grouped entry used to be read as 12 lb.
  it("reads comma-grouped weights as thousands", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "12,500");
    set(/e\.g\. 180,000/, "25,000");
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });

  it("reports an unparseable weight instead of computing with part of it", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "12k");
    set(/e\.g\. 180,000/, "20000");
    expect(screen.getByRole("alert").textContent).toMatch(/Piece weight isn't a number/);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("includes the hook block in the gross load compared to the chart", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "10000");
    set(/e\.g\. 1,200/, "2000");
    set(/e\.g\. 180,000/, "20000");
    // (10,000 + 2,000) / 20,000 = 60%. Sling tension still uses 10,000 only.
    expect(screen.getByText("60.0%")).toBeInTheDocument();
  });

  it("computes the heavier leg for an offset centre of gravity", () => {
    const { container } = render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "12000");
    set(/e\.g\. 180,000/, "100000");
    fireEvent.click(screen.getByRole("button", { name: /offset toward one pick point/i }));
    set(/e\.g\. 8$/, "8");
    set(/e\.g\. 4$/, "4");
    set(/e\.g\. 12$/, "12");
    // T1 = 12000·12·√80 / (8·16) ≈ 10,062.3 lb (hand check in cranePickMath.test.ts)
    expect(screen.getByText(/Max Leg Tension/i)).toBeInTheDocument();
    expect(container.textContent).toMatch(/10,062\.3\s*lb/);
  });

  it("applies the 50% personnel-platform limit", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "11000");
    set(/e\.g\. 180,000/, "20000");
    fireEvent.click(screen.getByRole("button", { name: /personnel platform lift/i }));
    expect(screen.getByText("55.0%")).toBeInTheDocument();
    expect(screen.getByText(/may not exceed 50% of rated capacity/i)).toBeInTheDocument();
  });

  it("flags an overloaded sling against its WLL", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 12,500/, "10000");
    set(/e\.g\. 180,000/, "20000");
    set(/from the tag/, "5000"); // 5,773.5 lb per leg at 60° → 115.5%
    expect(screen.getByText(/Sling OVERLOADED/)).toBeInTheDocument();
  });

  it("rejects a radius longer than the boom", () => {
    render(<CranePickCalculator />);
    set(/e\.g\. 110/, "50");
    set(/e\.g\. 45/, "80");
    expect(screen.getByRole("alert").textContent).toMatch(/radius must be less than the boom length/i);
  });
});
