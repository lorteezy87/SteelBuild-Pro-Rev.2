// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SuccessStep from "../SuccessStep";
import type { CrossSetSupersedeResult } from "@/lib/crossSetSupersede";

const L2 = { setId: "set-l2", setName: "Main Steel – L2" };
const noop = () => {};

describe("SuccessStep", () => {
  it("shows failed saves and every page that was not superseded", () => {
    const supersedeResult: CrossSetSupersedeResult = {
      superseded: [{ id: "a", sheetNumber: "S-201", ...L2 }, { id: "c", sheetNumber: "S-209", ...L2 }],
      failed: [{ id: "d", sheetNumber: "S-210", ...L2, message: "Set is locked", failure: "write" }],
      skipped: [{ id: "b", sheetNumber: "S-204", ...L2, skipReason: "replacement_not_saved", message: "its replacement didn't save — left live" }],
    };
    render(
      <SuccessStep
        createdCount={2}
        fileResults={[]}
        processError="1 sheet(s) failed to save. 2 saved successfully."
        supersedeResult={supersedeResult}
        onViewLog={noop}
        onUploadAnother={noop}
      />,
    );
    expect(screen.getByText("Upload finished with problems")).toBeInTheDocument();
    expect(screen.getByText(/Marked 2 pages superseded in Main Steel – L2: S-201, S-209/)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("1 sheet(s) failed to save. 2 saved successfully.")).toBeInTheDocument();
    expect(within(alert).getByText("S-210 (Main Steel – L2) is still live — Set is locked. Nothing was changed on it.")).toBeInTheDocument();
    expect(within(alert).getByText("S-204 (Main Steel – L2) is still live — its replacement didn't save.")).toBeInTheDocument();
  });

  it("surfaces a save failure even with no pages superseded", () => {
    render(
      <SuccessStep createdCount={2} fileResults={[]} processError="1 sheet(s) failed to save. 2 saved successfully." supersedeResult={null} onViewLog={noop} onUploadAnother={noop} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("1 sheet(s) failed to save. 2 saved successfully.");
    expect(screen.getByText("Upload finished with problems")).toBeInTheDocument();
  });

  it("stays a plain success when everything landed", () => {
    render(
      <SuccessStep
        createdCount={3}
        fileResults={[]}
        processError={null}
        supersedeResult={{ superseded: [{ id: "a", sheetNumber: "S-201", ...L2 }], failed: [], skipped: [] }}
        onViewLog={noop}
        onUploadAnother={noop}
      />,
    );
    expect(screen.getByText("Upload Complete")).toBeInTheDocument();
    expect(screen.getByText(/Marked 1 page superseded in Main Steel – L2: S-201/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
