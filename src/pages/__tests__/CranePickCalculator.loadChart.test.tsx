// @vitest-environment jsdom

/**
 * Crane Pick Calculator — rated capacity read from a load chart in the crane
 * library, end to end through the page.
 *
 * The lookup rules themselves are unit-tested in lib/crane/__tests__; this
 * checks the page WIRES them: the chart's number reaches the utilization, a
 * position the chart does not rate blocks the result instead of computing one,
 * and the chart's provenance reaches the Pick Summary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import CranePickCalculator from "../CranePickCalculator";
import { CRANE_LIBRARY_KEY, type CraneRecord } from "@/lib/crane/craneLibrary";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/calculators/CranePick3D", () => ({ default: (): null => null }));

/** SYNTHETIC crane — round numbers, not any real machine's chart. */
const CRANE: CraneRecord = {
  id: "crane-test",
  unit: "Crane 7",
  makeModel: "Test Hydraulic 60T",
  serial: "SN-0007",
  updatedAt: "2026-01-01T00:00:00.000Z",
  configurations: [{
    id: "cfg-main",
    label: "Main boom · full OR",
    boomType: "telescopic",
    counterweight: "30,000 lb",
    outriggers: "full",
    areaOfOperation: "360",
    chartSource: "Test chart book p. 12",
    chart: {
      boomLengths: [60, 80],
      radii: [20, 30, 40],
      capacities: [
        [60000, 40000, 28000],
        [52000, 36000, 25000],
      ],
    },
  }],
};

const set = (placeholder: RegExp, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

function renderWithLibrary() {
  localStorage.setItem(CRANE_LIBRARY_KEY, JSON.stringify([CRANE]));
  return render(<CranePickCalculator />);
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("capacity source", () => {
  it("opens in LOAD CHART mode when the library has a crane, and selects it", () => {
    renderWithLibrary();
    expect(screen.getByDisplayValue("Crane 7 — Test Hydraulic 60T")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Main boom · full OR")).toBeInTheDocument();
    // The manual capacity field is not offered in chart mode.
    expect(screen.queryByPlaceholderText(/180,000/)).toBeNull();
  });

  it("opens in MANUAL mode with an empty library — the original behaviour", () => {
    render(<CranePickCalculator />);
    expect(screen.getByPlaceholderText(/180,000/)).toBeInTheDocument();
  });

  it("switches to manual entry on request", () => {
    renderWithLibrary();
    fireEvent.click(screen.getByRole("button", { name: /type the rated capacity by hand/i }));
    expect(screen.getByPlaceholderText(/180,000/)).toBeInTheDocument();
  });
});

describe("reading the chart", () => {
  it("uses the exact cell and drives utilization from it", () => {
    const { container } = renderWithLibrary();
    set(/12,500/, "9000");
    set(/e\.g\. 110/, "80");
    set(/e\.g\. 45/, "30");

    expect(screen.getByTestId("chart-capacity")).toHaveTextContent("36,000 lb");
    expect(screen.getByTestId("chart-capacity")).toHaveTextContent("EXACT CELL");
    // 9,000 / 36,000 = 25.0%
    expect(container.textContent).toMatch(/25\.0%/);
  });

  it("between radii, takes the lower bracketing cell — never interpolates", () => {
    const { container } = renderWithLibrary();
    set(/12,500/, "10000");
    set(/e\.g\. 110/, "80");
    set(/e\.g\. 45/, "35");

    // Between 30 ft (36,000) and 40 ft (25,000): 25,000 governs, not 30,500.
    expect(screen.getByTestId("chart-capacity")).toHaveTextContent("25,000 lb");
    expect(screen.getByTestId("chart-capacity")).toHaveTextContent("LOWER BRACKETING CELL");
    expect(container.textContent).toMatch(/40\.0%/);
  });

  it("BLOCKS the result past the chart's last radius instead of computing one", () => {
    const { container } = renderWithLibrary();
    set(/12,500/, "10000");
    set(/e\.g\. 110/, "80");
    set(/e\.g\. 45/, "45");

    expect(screen.getByTestId("chart-refusal")).toHaveTextContent(/NOT RATED/);
    expect(screen.getByTestId("chart-refusal")).toHaveTextContent(/never extrapolated/);
    // No utilization percentage anywhere — the pick has no rated capacity.
    expect(container.textContent).not.toMatch(/\d+\.\d%/);
    expect(screen.getByRole("button", { name: /generate pick summary/i })).toBeDisabled();
  });

  it("requires boom length and radius once a chart is selected", () => {
    renderWithLibrary();
    set(/12,500/, "10000");
    expect(screen.getAllByText(/Enter boom length\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Enter working radius\./i).length).toBeGreaterThan(0);
  });
});

describe("provenance in the Pick Summary", () => {
  it("names the chart, its reference, the crane serial, and which cell was read", () => {
    renderWithLibrary();
    set(/12,500/, "10000");
    set(/e\.g\. 110/, "80");
    set(/e\.g\. 45/, "35");
    fireEvent.click(screen.getByRole("button", { name: /generate pick summary/i }));

    const dialog = screen.getByRole("dialog", { name: /pick summary/i });
    expect(dialog).toHaveTextContent("Load chart — Main boom · full OR");
    expect(dialog).toHaveTextContent("Test chart book p. 12");
    expect(dialog).toHaveTextContent("SN-0007");
    expect(dialog).toHaveTextContent(/25,000 lb from 80 ft boom \/ 40 ft radius/);
    expect(dialog).toHaveTextContent("Crane 7 — Test Hydraulic 60T");
  });
});
