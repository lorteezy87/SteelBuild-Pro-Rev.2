// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedRegisterRow } from "../docControl.derive";

const mocks = vi.hoisted(() => ({ evidence: vi.fn(), sheetTransmittal: vi.fn(), retry: vi.fn() }));
vi.mock("../useSheetSetEvidence", () => ({ useSheetSetEvidence: mocks.evidence }));
vi.mock("../useSheetTransmittalEvidence", () => ({ useSheetTransmittalEvidence: mocks.sheetTransmittal }));

import { SheetContextPanel } from "../SheetContextPanel";

const entry = {
  row: {
    drawing_id: "shop-sheet-1",
    project_id: "project-1",
    drawing_set_id: null,
    sheet_number: "S-101",
    sheet_title: "Level 1 framing",
    current_revision_id: "revision-current",
    current_revision: "C",
    current_status: "released_for_shop",
    active_hold_id: null,
  },
  pkg: null,
  setName: null,
  searchText: "",
} as IndexedRegisterRow;

beforeEach(() => {
  mocks.evidence.mockReturnValue({
    gate: { isPending: false, isError: false, data: null, refetch: vi.fn() },
    scope: { isPending: false, isError: false, data: null, refetch: vi.fn() },
  });
  mocks.sheetTransmittal.mockReset();
  mocks.retry.mockReset();
});

function renderPanel() {
  return render(<MemoryRouter><SheetContextPanel entry={entry} projectId="project-1" /></MemoryRouter>);
}

describe("selected sheet transmittal presentation", () => {
  it('uses field-facing evidence labels and keeps unknown revision and distribution explicit', () => {
    mocks.sheetTransmittal.mockReturnValue({ isPending: false, isError: false, data: { kind: 'none' } });
    const view = render(<MemoryRouter><SheetContextPanel entry={{ ...entry, row: { ...entry.row, current_revision_id: null, current_revision: null, current_status: null } }} projectId="project-1" /></MemoryRouter>);
    expect(screen.queryByText('drawing_revisions')).not.toBeInTheDocument();
    expect(screen.queryByText('release_status')).not.toBeInTheDocument();
    expect(screen.getByText('Current revision')).toBeInTheDocument();
    expect(screen.getByText('Revision distribution')).toBeInTheDocument();
    expect(view.container.querySelector('[data-evidence="revision"]')).toHaveTextContent('Not verified');
    expect(view.container.querySelector('[data-evidence="distribution"]')).toHaveTextContent('Not verified');
    expect(screen.getByText('Distribution is separate from fabrication authorization.')).toBeInTheDocument();
  });
  it("links the exact shop-sheet transmittal, states draft and revision evidence, and avoids fab authorization", () => {
    mocks.sheetTransmittal.mockReturnValue({
      isPending: false, isError: false,
      data: {
        kind: "found", id: "transmittal-7", number: "T-007", direction: "outgoing",
        lifecycle: "Draft · not issued", date: null, revision: "different",
      },
    });
    renderPanel();

    expect(mocks.sheetTransmittal).toHaveBeenCalledWith("project-1", "shop-sheet-1", "revision-current");
    expect(screen.getByText("T-007")).toBeInTheDocument();
    expect(screen.getByText(/Outgoing · Draft · not issued · Date not recorded/)).toBeInTheDocument();
    expect(screen.getByText(/different tracked revision is attached/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open exact transmittal" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=transmittals&transmittal=transmittal-7");
    expect(screen.getByText("Transmittal distribution does not authorize fabrication.")).toBeInTheDocument();
  });

  it("shows unavailable evidence and offers a retry when the exact read fails", () => {
    mocks.sheetTransmittal.mockReturnValue({
      isPending: false, isError: true, error: new Error("Sheet transmittal header missing"),
      data: undefined, refetch: mocks.retry,
    });
    renderPanel();

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/header missing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry transmittal read" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it("does not present cached transmittal details as current after a failed refresh", () => {
    mocks.sheetTransmittal.mockReturnValue({
      isPending: false, isError: true, isFetching: false,
      error: new Error("Refresh failed"), refetch: mocks.retry,
      data: {
        kind: "found", id: "transmittal-old", number: "T-OLD", direction: "outgoing",
        lifecycle: "Issued", date: "2026-10-01", revision: "current",
      },
    });
    renderPanel();

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("T-OLD")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open exact transmittal" })).toBeNull();
    expect(screen.queryByText(/Current tracked revision is attached/)).toBeNull();
  });

  it("hides cached transmittal details during a background refresh", () => {
    mocks.sheetTransmittal.mockReturnValue({
      isPending: false, isError: false, isFetching: true,
      data: {
        kind: "found", id: "transmittal-old", number: "T-OLD", direction: "outgoing",
        lifecycle: "Issued", date: "2026-10-01", revision: "current",
      },
    });
    renderPanel();

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByText("T-OLD")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open exact transmittal" })).toBeNull();
  });
});
