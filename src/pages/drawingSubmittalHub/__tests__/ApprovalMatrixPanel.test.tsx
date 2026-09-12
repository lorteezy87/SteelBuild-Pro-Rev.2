// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalAttachment, TransmittalRow } from "@/hooks/useTransmittals";

// Analytics cards below the grid read their own data; not under test here.
vi.mock("@/components/submittals/CycleTimeCard", () => ({ default: (): null => null }));
vi.mock("@/components/submittals/AgingReportTable", () => ({ default: (): null => null }));

import { ApprovalMatrixPanel } from "../ApprovalMatrixPanel";
import type { HoldsStatus, LastSentStatus } from "../ApprovalMatrixPanel";
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

// Current revision per sheet: T-014 sent d1 at r1, which is still current.
const CURRENT: ReadonlyMap<string, string> = new Map([["d1", "r1"], ["d2", "r2"], ["d3", "r3"]]);

function mount({
  entry = "/DrawingSubmittalHub?hub_tab=matrix",
  canCreate = true,
  transmittalsLoading = false,
  holdsStatus = "ready" as HoldsStatus,
  submittals = SUBMITTALS,
  drawings = DRAWINGS as any[],
  // null = the log is never handed over.
  transmittals = TRANSMITTALS as TransmittalRow[] | null,
  currentRevisionIdByDrawingId = CURRENT,
  lastSentStatus = undefined as LastSentStatus | undefined,
} = {}) {
  const setPackages = buildSetPackages(drawings as any, SETS as any, submittals as any);
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
        transmittals={transmittals ?? undefined}
        transmittalsLoading={transmittalsLoading}
        currentRevisionIdByDrawingId={currentRevisionIdByDrawingId}
        lastSentStatus={lastSentStatus}
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

/** Expand a set's row through its disclosure button; returns its Last sent line. */
function expandLastSent(setId: string): HTMLElement {
  const name = SETS.find((s) => s.id === setId)?.set_name ?? "";
  fireEvent.click(within(row(setId)).getByRole("button", { name }));
  const line = document.querySelector(`#matrix-detail-${setId} [data-last-sent]`);
  if (!line) throw new Error(`no Last sent line for ${setId}`);
  return line as HTMLElement;
}

const sentItem = (id: string, drawingId: string | null, revisionId: string): TransmittalAttachment => ({
  id, drawing_revision_id: revisionId, drawing_id: drawingId, sheet_number: null, sheet_title: null, revision_code: null,
});

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

describe("ApprovalMatrixPanel — Last sent (expanded row)", () => {
  it("names the last outgoing transmittal, when and to whom, its sheets, and how many were revised since", () => {
    mount();
    const line = expandLastSent("s1");
    expect(line.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 1 sheet · 0 revised since");
    expect(within(line).getByRole("link", { name: "T-014" })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=transmittals&transmittal=t-1");
    // Nothing revised: the ordinary text colour, not the warning one.
    expect(within(line).getByText("0 revised since").style.color).toBe("var(--cmd-text)");
  });

  it("drops ' · to ' when the recipient is blank", () => {
    mount({ transmittals: [{ ...TRANSMITTALS[0], sent_to: "   " }] });
    expect(expandLastSent("s1").textContent).toBe("Last sent: T-014 · Aug 3, 26 · 1 sheet · 0 revised since");
  });

  it("counts a sheet revised since it was sent, in the warning colour, and explains the count on hover", () => {
    mount({ currentRevisionIdByDrawingId: new Map([["d1", "r1-B"], ["d2", "r2"]]) });
    const line = expandLastSent("s1");
    expect(line.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 1 sheet · 1 revised since");
    const revised = within(line).getByText("1 revised since");
    expect(revised).toHaveAttribute("title", "Revised since sent: 1 of 1 sheet checked against a current revision");
    expect(revised.style.color).toBe("var(--cmd-warn-text)");
  });

  it("reports a sheet superseded NOW, never 'since', because the supersession date isn't recorded", () => {
    // The revise-as-a-new-set workflow marks the old sheet superseded.
    const drawings = [
      { id: "d1", drawing_set_id: "s1", stage: "IFA" },
      { id: "d2", drawing_set_id: "s1", stage: "IFA", is_superseded: true },
      { id: "d3", drawing_set_id: "s2", stage: "OFA" },
    ];
    const sent = { ...TRANSMITTALS[0], items: [...TRANSMITTALS[0].items, sentItem("i2", "d2", "r2")] };
    mount({ drawings, transmittals: [sent] });
    const line = expandLastSent("s1");
    expect(line.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 2 sheets · 0 revised since · 1 now superseded");
    const superseded = within(line).getByText("1 now superseded");
    expect(superseded).toHaveAttribute(
      "title",
      "Superseded now: 1 sheet. When a sheet was superseded isn't recorded, so this can include sheets superseded before T-014 went out.",
    );
    // Either count above 0 is a warning; a 0 beside it is not.
    expect(superseded.style.color).toBe("var(--cmd-warn-text)");
    expect(within(line).getByText("0 revised since").style.color).toBe("var(--cmd-text)");
  });

  it("says a set no outgoing transmittal carried is not sent yet", () => {
    mount();
    expect(expandLastSent("s2").textContent).toBe("Last sent: Not sent yet");
  });

  it("says a set an undated outgoing transmittal carried was sent, date not entered, never 'Not sent yet'", () => {
    mount({ transmittals: [{ ...TRANSMITTALS[0], date_sent: null }] });
    const line = expandLastSent("s1");
    expect(line).toHaveAttribute("data-last-sent", "undated");
    expect(line.textContent).toBe("Last sent: T-014 · Sent (date not entered)");
    expect(within(line).getByRole("link", { name: "T-014" })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=transmittals&transmittal=t-1");
    expect(within(line).getByText("Sent (date not entered)")).toHaveAttribute(
      "title",
      "T-014 is logged as outgoing with no send date, so when it went out, and what changed since, can't be shown.",
    );
    // It carried nothing of Anchor Bolts, and every item matched a sheet.
    expect(expandLastSent("s2").textContent).toBe("Last sent: Not sent yet");
  });

  it("says Unknown, never 'Not sent yet', when a transmittal item can't be matched to a sheet", () => {
    const sent = { ...TRANSMITTALS[0], items: [...TRANSMITTALS[0].items, sentItem("i2", null, "r-unloaded")] };
    mount({ transmittals: [sent] });
    const bolts = expandLastSent("s2");
    expect(bolts.textContent).toBe("Last sent: Unknown");
    expect(within(bolts).getByText("Unknown")).toHaveAttribute(
      "title",
      "1 transmittal item couldn't be matched to a sheet, so this set's last outgoing transmittal can't be confirmed.",
    );
    // The set the matched item belongs to still shows its transmittal.
    expect(within(expandLastSent("s1")).getByRole("link", { name: "T-014" })).toBeInTheDocument();
  });

  it("says Unknown, never 'Not sent yet', when the log read may have been cut off at the row cap", () => {
    const cutOff = Object.defineProperty([...TRANSMITTALS], "possiblyTruncated", { value: true });
    mount({ transmittals: cutOff });
    const bolts = expandLastSent("s2");
    expect(bolts.textContent).toBe("Last sent: Unknown");
    expect(within(bolts).getByText("Unknown")).toHaveAttribute(
      "title",
      "Some transmittal records weren't loaded, so this set's last outgoing transmittal can't be confirmed.",
    );
    // A set with a transmittal of its own still shows it.
    expect(within(expandLastSent("s1")).getByRole("link", { name: "T-014" })).toBeInTheDocument();
  });

  it("gives both reasons when the log was cut off and an item couldn't be matched", () => {
    const sent = { ...TRANSMITTALS[0], items: [...TRANSMITTALS[0].items, sentItem("i2", null, "r-unloaded")] };
    mount({ transmittals: Object.defineProperty([sent], "possiblyTruncated", { value: true }) });
    expect(within(expandLastSent("s2")).getByText("Unknown")).toHaveAttribute(
      "title",
      "Some transmittal records weren't loaded; 1 transmittal item couldn't be matched to a sheet, so this set's last outgoing transmittal can't be confirmed.",
    );
  });

  it("says how many sheets it couldn't check, and claims no '0 revised' when it could check none", () => {
    mount({ currentRevisionIdByDrawingId: new Map() });
    const line = expandLastSent("s1");
    expect(line.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 1 sheet · 1 couldn't be checked");
    expect(within(line).getByText("1 couldn't be checked")).toHaveAttribute(
      "title",
      "No current revision is loaded for 1 sheet, so it isn't counted as revised.",
    );
  });

  it("counts revisions over the sheets it could check, and says how many it couldn't", () => {
    const sent = { ...TRANSMITTALS[0], items: [...TRANSMITTALS[0].items, sentItem("i2", "d2", "r2")] };
    mount({ transmittals: [sent], currentRevisionIdByDrawingId: new Map([["d1", "r1"]]) });
    const line = expandLastSent("s1");
    expect(line.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 2 sheets · 0 revised since · 1 couldn't be checked");
    expect(within(line).getByText("0 revised since")).toHaveAttribute(
      "title",
      "Revised since sent: 0 of 1 sheet checked against a current revision",
    );
  });

  it("holds a screen-reader-announced placeholder, not 'Not sent yet', while its inputs load", () => {
    mount({ lastSentStatus: "loading" });
    const line = expandLastSent("s2");
    expect(within(line).getByText("Loading last sent transmittal")).toHaveClass("sr-only");
    expect(line).not.toHaveTextContent("Not sent yet");
  });

  it("treats a log that was never handed over as loading, not as nothing sent", () => {
    mount({ transmittals: null });
    const line = expandLastSent("s2");
    expect(within(line).getByText("Loading last sent transmittal")).toHaveClass("sr-only");
    expect(line).not.toHaveTextContent("Not sent yet");
  });

  it("says its inputs couldn't be loaded instead of guessing", () => {
    mount({ lastSentStatus: "error" });
    const line = expandLastSent("s2");
    expect(within(line).getByText("Transmittals or revisions couldn't be loaded")).toHaveClass("sr-only");
    expect(line).toHaveTextContent("?");
    expect(line).not.toHaveTextContent("Not sent yet");
  });

  it("leaves #334's Last Transmittal column on the newest in either direction", () => {
    const incoming: TransmittalRow = {
      ...TRANSMITTALS[0],
      id: "t-2", transmittal_number: "T-015", direction: "incoming", sent_to: null, received_from: "EOR",
      date_sent: null, date_received: "2026-08-07", created_at: "2026-08-07T09:00:00Z",
      items: [sentItem("i9", "d1", "r1")],
    };
    mount({ transmittals: [...TRANSMITTALS, incoming] });
    const main = within(row("s1"));
    expect(main.getByRole("link", { name: "T-015" })).toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=transmittals&transmittal=t-2");
    expect(main.getByText("incoming")).toBeInTheDocument();
    const line = expandLastSent("s1");
    expect(within(line).getByRole("link", { name: "T-014" })).toBeInTheDocument();
    expect(line).not.toHaveTextContent("T-015");
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
