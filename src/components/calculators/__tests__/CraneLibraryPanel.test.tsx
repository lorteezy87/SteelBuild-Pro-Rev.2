// @vitest-environment jsdom

/**
 * CraneLibraryPanel — entering a crane and its chart. The parse rules are
 * unit-tested in lib/crane; this checks the panel shows the person pasting
 * exactly what landed, refuses a chart it could not read, and will not save a
 * chart without the provenance every pick summary prints.
 */
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import CraneLibraryPanel from "../CraneLibraryPanel";
import type { CraneRecord } from "@/lib/crane/craneLibrary";

const typeInto = (placeholder: RegExp | string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const chartBox = () => screen.getByLabelText(/Load chart — gross capacities/);
const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function openNewConfig() {
  const onChange = vi.fn<(next: CraneRecord[]) => void>();
  render(<CraneLibraryPanel open cranes={[]} onChange={onChange} onClose={() => {}} />);
  click(/\+ Add crane/);
  typeInto("e.g. Crane 14", "Crane 7");
  typeInto("As on the chart book", "Test Hydraulic 60T");
  click(/\+ Add configuration/);
  return onChange;
}

describe("pasting a chart", () => {
  it("reads back the parsed grid, blanks shown as not rated", () => {
    openNewConfig();
    fireEvent.change(chartBox(), { target: { value: "r\t20\t30\n60\t60,000\t40,000\n80\t52,000\t-" } });

    expect(screen.getByText(/2 boom lengths × 2 radii, 3 rated cells/)).toBeInTheDocument();
    const grid = screen.getByRole("table");
    const row80 = within(grid).getByRole("rowheader", { name: "80" }).closest("tr") as HTMLElement;
    expect(row80).toHaveTextContent("52,000");
    expect(row80).toHaveTextContent("—");
  });

  it("shows the parse error and no grid for a chart it cannot read", () => {
    openNewConfig();
    fireEvent.change(chartBox(), { target: { value: "r,30,40\n60,12,500,9000" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/thousands comma/);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("warns on a capacity that rises with radius", () => {
    openNewConfig();
    fireEvent.change(chartBox(), { target: { value: "r\t30\t40\n80\t3600\t36000" } });
    expect(screen.getByText(/rises from 3,600 lb at 30 ft to 36,000 lb at 40 ft/)).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("refuses a configuration without a name or chart source", () => {
    openNewConfig();
    fireEvent.change(chartBox(), { target: { value: "r\t20\n60\t50000" } });
    click(/Save configuration/);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Give this configuration a name/);
    expect(alert).toHaveTextContent(/Record where the chart came from/);
    expect(screen.getByRole("button", { name: /Save configuration/ })).toBeInTheDocument();
  });

  it("saves a crane with the parsed chart", () => {
    const onChange = openNewConfig();
    typeInto("e.g. Main boom · 58k CWT · full OR", "Main boom");
    typeInto("Chart book, page, revision", "Chart book p. 12");
    fireEvent.change(chartBox(), { target: { value: "r\t20\t30\n60\t60000\t-" } });
    click(/Save configuration/);
    click(/Save crane/);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [saved] = onChange.mock.calls[0][0];
    expect(saved.unit).toBe("Crane 7");
    expect(saved.configurations[0].chartSource).toBe("Chart book p. 12");
    expect(saved.configurations[0].chart).toEqual({ boomLengths: [60], radii: [20, 30], capacities: [[60000, null]] });
  });

  it("will not save a crane with no configuration", () => {
    const onChange = vi.fn();
    render(<CraneLibraryPanel open cranes={[]} onChange={onChange} onClose={() => {}} />);
    click(/\+ Add crane/);
    typeInto("e.g. Crane 14", "Crane 7");
    typeInto("As on the chart book", "Test Hydraulic 60T");
    click(/Save crane/);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Add at least one configuration/);
  });
});
