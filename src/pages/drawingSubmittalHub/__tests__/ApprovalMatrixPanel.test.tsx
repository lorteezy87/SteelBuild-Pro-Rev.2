// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalRow } from "@/hooks/useTransmittals";

// Analytics cards below the grid read their own data; not under test here.
vi.mock("@/components/submittals/CycleTimeCard", () => ({ default: (): null => null }));
vi.mock("@/components/submittals/AgingReportTable", () => ({ default: (): null => null }));

import { ApprovalMatrixPanel } from "../ApprovalMatrixPanel";
import type { HoldsStatus } from "../ApprovalMatrixPanel";
import { buildSetPackages } from "../format";

afterEach(cleanup);

const SETS = [
  { id: "s1", set_name: "Main Steel" },
  { id: "s2", set_name: "Anchor Bolts" },
];
const DRAWINGS = [
  { id: "d1", drawing_set_id: "s1", stage: "IFA" },
  { id: "d2", drawing_set_id: "s1", stage: "IFA" },
  { id: "d3", drawing_set_id: "s2", stage: "OFA" },
];
const SUBMITTALS: any[] = [{
  id: "sub-1",
  drawing_set_ids: ["s1"],
  status: "Under Review",
  ball_in_court: "EOR",
  submittal_number: "SUB-001",
  submitted_date: "2026-08-01",
  required_date: "2099-01-01",
}];

const HOLDS: DrawingHoldRow[] = [{
  id: "h1", project_id: "p1", drawing_id: "d3", reason: "Pending RFI", prior_release_status: null,
  placed_by_id: null, placed_by_name: null, placed_at: "2026-08-01T00:00:00Z", is_active: true,
  released_by_id: null, released_by_name: null, released_at: null, release_notes: null, created_at: "2026-08-01T00:00:00Z",
}];

const TRANSMITTALS: TransmittalRow[] = [{
  id: "t-1", project_id: "p1", transmittal_number: "T-014", direction: "outgoing",
  source_company: null, received_from: null, sent_to: "EOR", subject: null,
  date_sent: "2026-08-03", date_received: null, notes: null, created_at: "2026-08-03T09:00:00Z", is_deleted: false,
  items: [{ id: "i1", drawing_revision_id: "r1", drawing_id: "d1", sheet_number: "S1", sheet_title: null, revision_code: "0" }],
  item_count: 1,
}];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function mount({
  entry = "/DrawingSubmittalHub?hub_tab=matrix",
  canCreate = true,
  transmittalsLoading = false,
  holdsStatus = "ready" as HoldsStatus,
  submittals = SUBMITTALS,
} = {}) {
  const setPackages = buildSetPackages(DRAWINGS as any, SETS as any, submittals as any);
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ApprovalMatrixPanel
        drawingSets={SETS}
        submittals={submittals}
        roundsBySubmittal={{}}
        isLoading={false}
        setPackages={setPackages}
        // The hub hands over its [] default until the holds query answers.
        holds={holdsStatus === "ready" ? HOLDS : []}
        holdsStatus={holdsStatus}
        transmittals={TRANSMITTALS}
        transmittalsLoading={transmittalsLoading}
        canCreateSubmittal={canCreate}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function row(setId: string): HTMLElement {
  const el = document.querySelector(`tr[data-set-id="${setId}"]`);
  if (!el) throw new Error(`no matrix row for ${setId}`);
  return el as HTMLElement;
}

const rowIds = () => Array.from(document.querySelectorAll("tr[data-set-id]")).map((el) => el.getAttribute("data-set-id"));

describe("ApprovalMatrixPanel — 2026 columns on Rev.2 logic", () => {
  it("renders sheets, holds, stage·status and last transmittal beside the governing submittal", () => {
    mount();
    for (const name of ["Sheets", "On Hold", "Stage · Status", "Last Transmittal"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const main = within(row("s1"));
    expect(main.getByRole("link", { name: "SUB-001" })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-1");
    expect(main.getByText("2")).toBeInTheDocument(); // live sheets
    expect(main.getByText("Under Review")).toBeInTheDocument(); // raw status beside the stage
    expect(main.getByRole("link", { name: "T-014" })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=transmittals&transmittal=t-1");
    expect(main.getByText("outgoing")).toBeInTheDocument();
  });

  it("offers '+ Create submittal', pre-linked to the set, only to users who can create", () => {
    mount();
    // The accessible name starts with the visible label (WCAG 2.5.3 Label in Name).
    expect(within(row("s2")).getByRole("link", { name: "Create submittal for Anchor Bolts" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&targetSetId=s2");
    cleanup();

    mount({ canCreate: false });
    expect(within(row("s2")).queryByRole("link", { name: /Create submittal/ })).not.toBeInTheDocument();
    expect(within(row("s2")).getByText("No submittal")).toBeInTheDocument();
  });

  it("links held sheets to Holds & Blockers and marks a sheet-derived stage as such", () => {
    mount();
    const bolts = within(row("s2"));
    expect(bolts.getByRole("link", { name: /1 sheet on hold in Anchor Bolts/ })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=holds");
    expect(bolts.getByText("from sheets")).toHaveAttribute("title", "No submittal governs this set yet, so its sheets' stage is shown.");
    expect(within(row("s1")).queryByText("from sheets")).not.toBeInTheDocument();
  });

  it("explains a sheet-derived stage correctly when the governing submittal is Void", () => {
    mount({ submittals: [...SUBMITTALS, { id: "void-1", drawing_set_ids: ["s2"], status: "Void", submittal_number: "SUB-009" }] });
    const bolts = within(row("s2"));
    expect(bolts.getByRole("link", { name: "SUB-009" })).toBeInTheDocument();
    expect(bolts.getByText("from sheets").getAttribute("title")).toMatch(/governing submittal \(Void\) has no workflow stage/);
  });

  it("doesn't expand the row when a cell link is followed", () => {
    mount();
    fireEvent.click(within(row("s1")).getByRole("link", { name: "SUB-001" }));
    expect(document.getElementById("matrix-detail-s1")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent("hub_tab=submittals&recordId=sub-1");
  });

  it("announces the transmittal placeholder to screen readers while the log loads", () => {
    mount({ transmittalsLoading: true });
    expect(within(row("s1")).getByText("Loading transmittals")).toHaveClass("sr-only");
  });
});

describe("ApprovalMatrixPanel — click-through, linkable filters", () => {
  it("filters rows from a pill, records it in the URL, and clears it", () => {
    mount();
    const pill = screen.getByRole("button", { name: /On Hold/ });
    expect(pill).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pill);
    expect(rowIds()).toEqual(["s2"]);
    expect(screen.getByRole("button", { name: /On Hold/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("matrix_filter=hold");

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(rowIds()).toHaveLength(2);
    expect(screen.getByTestId("location")).not.toHaveTextContent("matrix_filter");
  });

  it("opens a linked filter pre-applied and ignores an unknown one", () => {
    mount({ entry: "/DrawingSubmittalHub?hub_tab=matrix&matrix_filter=nosub" });
    expect(rowIds()).toEqual(["s2"]);
    cleanup();

    mount({ entry: "/DrawingSubmittalHub?hub_tab=matrix&matrix_filter=bogus" });
    expect(rowIds()).toHaveLength(2);
  });

  it("won't switch on a pill with nothing behind it", () => {
    mount();
    expect(screen.getByRole("button", { name: /Approved/ })).toBeDisabled();
  });
});

describe("ApprovalMatrixPanel — holds not known yet", () => {
  it("says holds are loading instead of showing none", () => {
    mount({ holdsStatus: "loading" });
    const bolts = within(row("s2"));
    expect(bolts.getByText("Loading holds")).toBeInTheDocument();
    expect(bolts.queryByRole("link", { name: /on hold/ })).not.toBeInTheDocument();
    const pill = screen.getByRole("button", { name: /On Hold/ });
    expect(pill).toHaveTextContent("…");
    expect(pill).toBeEnabled(); // unknown is not zero
  });

  it("keeps a linked hold filter honest while holds load", () => {
    mount({ entry: "/DrawingSubmittalHub?hub_tab=matrix&matrix_filter=hold", holdsStatus: "loading" });
    expect(screen.getByText("Checking holds…")).toBeInTheDocument();
    expect(screen.queryByText(/No drawing sets match this filter/)).not.toBeInTheDocument();
  });

  it("says so when holds couldn't be loaded", () => {
    mount({ entry: "/DrawingSubmittalHub?hub_tab=matrix&matrix_filter=hold", holdsStatus: "error" });
    expect(screen.getByText(/Holds couldn't be loaded, so this filter can't be applied/)).toBeInTheDocument();
    cleanup();

    mount({ holdsStatus: "error" });
    expect(within(row("s2")).getByText("Holds couldn't be loaded")).toBeInTheDocument();
  });
});
