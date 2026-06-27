// @vitest-environment jsdom
//
// Smoke test for CalculatorsHub after the device-shell redesign. Pins the two
// invariants that the redesign must not break:
//   - the tool rail renders all 5 calculator labels
//   - ?calc_tab=feetinches deep-links to (mounts) the Ft / In tool
//
// The five lazy tool pages are mocked with trivial stubs so the render is
// stable and we don't drag their real engines/state into the test.

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/pages/RegularCalculator", () => ({
  default: () => <div>REGULAR_CALC</div>,
}));
vi.mock("@/pages/FeetInchesCalculator", () => ({
  default: () => <div>FEETINCHES_CALC</div>,
}));
vi.mock("@/pages/SteelWeightCalculator", () => ({
  default: () => <div>STEELWEIGHT_CALC</div>,
}));
vi.mock("@/pages/CranePickCalculator", () => ({
  default: () => <div>CRANEPICK_CALC</div>,
}));
vi.mock("@/pages/DecimalFractionConverter", () => ({
  default: () => <div>DECIMALFRACTION_CALC</div>,
}));

import CalculatorsHub from "@/pages/CalculatorsHub";

function renderHub(initialEntry = "/Calculators") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CalculatorsHub />
    </MemoryRouter>,
  );
}

describe("CalculatorsHub — device-shell smoke", () => {
  it("the tool rail renders all 5 calculator labels", () => {
    renderHub();
    expect(screen.getByText("Calculator")).toBeInTheDocument();
    expect(screen.getByText("Ft / In")).toBeInTheDocument();
    expect(screen.getByText("Steel Weight")).toBeInTheDocument();
    expect(screen.getByText("Crane Pick")).toBeInTheDocument();
    expect(screen.getByText("Decimal / Fraction")).toBeInTheDocument();
  });

  it("defaults to the Regular calculator with no ?calc_tab=", async () => {
    renderHub("/Calculators");
    expect(await screen.findByText("REGULAR_CALC")).toBeInTheDocument();
  });

  it("?calc_tab=feetinches mounts the Ft / In tool", async () => {
    renderHub("/Calculators?calc_tab=feetinches");
    expect(await screen.findByText("FEETINCHES_CALC")).toBeInTheDocument();
    // and the Ft / In rail button is the active one
    const ftBtn = screen.getByText("Ft / In").closest("button");
    expect(ftBtn).toHaveAttribute("aria-pressed", "true");
  });
});
