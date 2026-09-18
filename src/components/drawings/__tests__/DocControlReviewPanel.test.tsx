// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocControlReviewPanel from "../DocControlReviewPanel";
import type { UploadMatch } from "@/lib/docControl";

const revised: UploadMatch = {
  sheetNumber: "S-101",
  change: "revised",
  oldSheet: { id: "d1", sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revisionNumber: "1" },
  newSheet: { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "IFC", date: "04/02/2026", pdfPage: 3 },
};

function renderPanel(overrides: Record<string, unknown> = {}) {
  return render(
    <DocControlReviewPanel
      reviewerName="N. Lortie"
      intake={{
        matches: [revised],
        setMeta: { projectName: "Desert Ridge Phase 2", revision: "IFC", issueDate: "04/02/2026" },
        scanned: false,
        // A real text layer for page 3, with no seal wording in it — the case
        // where the panel must say "unverified", not "missing".
        pageTextByPdfPage: { 3: "FOUNDATION PLAN\nSCALE: 1/4\" = 1'-0\"\nGRID A-F" },
        projectId: "p1",
        ...overrides,
      }}
    />,
  );
}

/**
 * Accepted sheets render collapsed — a 60-sheet upload would otherwise be an
 * unreadable wall. Held sheets open themselves. Tests that read a card's
 * contents expand it first, the way a reviewer does.
 */
function expandCard(label = "S-101") {
  fireEvent.click(screen.getByText(label));
}

describe("DocControlReviewPanel", () => {
  it("renders nothing when the upload carries no incoming sheets", () => {
    const { container } = renderPanel({ matches: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the sheet, its title block values and the register verdict", () => {
    renderPanel();
    expect(screen.getByText("S-101")).toBeTruthy();
    expandCard();
    expect(screen.getByText("Desert Ridge Phase 2")).toBeTruthy();
    expect(screen.getByText("2026-04-02")).toBeTruthy();
    expect(screen.getByText(/Matches sheet S-101 in this set at revision 1/)).toBeTruthy();
  });

  it("distinguishes a field read-and-blank from a field never inspected", () => {
    // projectName IS in the payload and empty → read, and blank.
    // authorizingEngineer is absent from the payload → never inspected.
    renderPanel({ setMeta: { projectName: "", revision: "IFC", issueDate: "04/02/2026" } });
    expandCard();
    expect(screen.getByText("not stated on the sheet")).toBeTruthy();
    expect(screen.getAllByText(/not inspected — unknown/).length).toBeGreaterThan(0);
  });

  it("never claims line work was compared", () => {
    renderPanel();
    expandCard();
    expect(screen.getByText(/Overlay the two sheets before releasing/)).toBeTruthy();
    expect(screen.getByText("line-work · not compared")).toBeTruthy();
  });

  it("reports an unverified seal as a warning, not a missing one", () => {
    renderPanel();
    expandCard();
    // On the seal chip and again as the warning finding.
    expect(screen.getAllByText(/not evidence the sheet is unsealed/).length).toBe(2);
    expect(screen.getByText("ACCEPT")).toBeTruthy();
  });

  it("holds the sheet once a reviewer confirms the seal is missing", () => {
    renderPanel();
    expandCard();
    const seal = screen.getByTitle(/Seals are usually raster images/);
    fireEvent.click(within(seal).getByText(/It is missing/));
    expect(screen.getByText("HOLD")).toBeTruthy();
    // Shown twice on purpose: on the seal chip and again as a blocker finding.
    expect(screen.getAllByText(/Confirmed MISSING on the sheet by N. Lortie/).length).toBe(2);
    expect(screen.getByText(/1 on hold/)).toBeTruthy();
  });

  it("offers no attest control for a sheet it cannot identify", () => {
    renderPanel({
      matches: [{ sheetNumber: "", change: "ambiguous", newSheet: { sheetNumber: "", sheetTitle: "?" } }],
    });
    // An unidentified sheet is a blocker, so its card opens on its own.
    expect(screen.getByText(/Key in a sheet number before attesting/)).toBeTruthy();
    expect(screen.queryByText(/It is missing/)).toBeNull();
  });
});
