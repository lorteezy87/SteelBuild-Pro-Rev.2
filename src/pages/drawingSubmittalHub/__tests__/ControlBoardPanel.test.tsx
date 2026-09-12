// @vitest-environment jsdom
/**
 * ControlBoardPanel: record deep links (owner decision 3, 2026-09-11).
 *
 * Inside the hub (which passes onOpenHref, a push-navigate), a queue row,
 * Open Work and Create submittal open the record behind the item: a set's
 * governing submittal, else the set's Sets & revisions view, else the item's
 * tab. Without onOpenHref the board keeps its tab-switch behaviour.
 *
 * The triage fixture comes from the real buildTriage, so these tests follow
 * the fields (_submittalId, _drawingSetId, routeTab) the hub hands over.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import ControlBoardPanel from "../ControlBoardPanel";
import { buildSetPackages, buildTriage } from "../format";
import type { TriageModel } from "../types";

afterEach(cleanup);

// Every due date is years past, so each item is overdue whatever today is,
// and the oldest (Main Steel, due through its submittal) is the focus.
const SETS = [
  { id: "set-linked", set_name: "Main Steel" },
  { id: "set-open", set_name: "Anchor Bolts" },
];
const DRAWINGS = [
  { id: "d1", drawing_set_id: "set-linked", stage: "IFA" },
  { id: "d2", drawing_set_id: "set-open", stage: "IFA", due_date: "2020-01-02" },
];
const LINKED_SUBMITTAL = {
  id: "sub-1",
  drawing_set_ids: ["set-linked"],
  status: "Under Review",
  ball_in_court: "EOR",
  submittal_number: "SUB-001",
  submitted_date: "2019-12-01",
  required_date: "2020-01-01",
};
const UNLINKED_SUBMITTAL = {
  id: "sub-2",
  drawing_set_ids: [] as string[],
  status: "Revise and Resubmit",
  ball_in_court: "Detailer",
  submittal_number: "SUB-002",
  title: "Embed plates",
  required_date: "2020-01-03",
};

const HUB = "/DrawingSubmittalHub";
const RECORD_SUB_1 = `${HUB}?hub_tab=submittals&recordId=sub-1`;
const RECORD_SUB_2 = `${HUB}?hub_tab=submittals&recordId=sub-2`;
const SETS_VIEW = `${HUB}?hub_tab=drawings&hub_view=sets`;
const CREATE_SET_OPEN = `${HUB}?hub_tab=submittals&targetSetId=set-open`;

function triageFor(submittals: any[]) {
  return buildTriage(submittals, buildSetPackages(DRAWINGS as any, SETS as any, submittals as any), new Map());
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderBoard(triage: TriageModel, { inHub = true }: { inHub?: boolean } = {}) {
  const onOpenTab = vi.fn();
  const onOpenHref = vi.fn();
  render(
    <MemoryRouter initialEntries={[HUB]}>
      <ControlBoardPanel
        triage={triage}
        kpis={{ pending: 0, total: 0 }}
        drawingKpis={{ totalSets: 0, totalSheets: 0, released: 0, inReview: 0, overdue: 0 }}
        isLoading={false}
        onOpenTab={onOpenTab}
        onOpenHref={inHub ? onOpenHref : undefined}
        sequenceReadiness={[]}
        revisionImpact={[]}
        isSaving={false}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onOpenTab, onOpenHref };
}

function panel(title: string): HTMLElement {
  const section = screen.getByRole("heading", { name: title }).closest("section");
  if (!section) throw new Error(`No "${title}" panel`);
  return section;
}

const queueRow = (name: RegExp) => within(panel("Critical Work Queue")).getByRole("button", { name });
const location = () => screen.getByTestId("location").textContent;

describe("ControlBoardPanel: in the hub (onOpenHref)", () => {
  it("opens a queue row's governing submittal, by click, Enter or Space, and stays a focusable button", () => {
    const { onOpenHref, onOpenTab } = renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]));
    const row = queueRow(/Main Steel/);
    expect(row).toHaveAttribute("tabindex", "0");

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "Tab" });

    expect(onOpenHref.mock.calls).toEqual([[RECORD_SUB_1], [RECORD_SUB_1], [RECORD_SUB_1]]);
    expect(onOpenTab).not.toHaveBeenCalled();
    // The panel only reports the href; the hub does the navigating.
    expect(location()).toBe(HUB);
  });

  it("opens a set without a submittal on Sets & revisions, and an unlinked submittal's own record", () => {
    const { onOpenHref } = renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]));

    fireEvent.click(queueRow(/Anchor Bolts/));
    expect(onOpenHref).toHaveBeenLastCalledWith(SETS_VIEW);

    fireEvent.keyDown(queueRow(/SUB-002 - Embed plates/), { key: "Enter" });
    expect(onOpenHref).toHaveBeenLastCalledWith(RECORD_SUB_2);
  });

  it("Open Work opens the focus item's governing submittal", () => {
    const { onOpenHref, onOpenTab } = renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]));
    fireEvent.click(screen.getByRole("button", { name: /Open Work/ }));
    expect(onOpenHref).toHaveBeenCalledWith(RECORD_SUB_1);
    expect(onOpenTab).not.toHaveBeenCalled();
    // A set a submittal governs offers no Create submittal.
    expect(screen.queryByRole("button", { name: "Create submittal" })).not.toBeInTheDocument();
  });

  it("Create submittal opens create on the hub's Submittal Register, pre-linked to the set", () => {
    // No submittals at all: Anchor Bolts is the overdue focus, with nothing linked.
    const { onOpenHref, onOpenTab } = renderBoard(triageFor([]));
    expect(screen.getByRole("heading", { name: "Next decision" }).closest("section")).toHaveTextContent("Anchor Bolts");

    fireEvent.click(screen.getByRole("button", { name: "Create submittal" }));
    expect(onOpenHref).toHaveBeenCalledWith(CREATE_SET_OPEN);
    expect(onOpenHref.mock.calls[0][0]).not.toContain("new=");

    fireEvent.click(screen.getByRole("button", { name: /Open Work/ }));
    expect(onOpenHref).toHaveBeenLastCalledWith(SETS_VIEW);
    expect(onOpenTab).not.toHaveBeenCalled();
    expect(location()).toBe(HUB);
  });

  it("View all still opens the Approval Matrix tab", () => {
    const { onOpenHref, onOpenTab } = renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]));
    fireEvent.click(within(panel("Critical Work Queue")).getByRole("button", { name: "View all" }));
    expect(onOpenTab).toHaveBeenCalledWith("matrix");
    expect(onOpenHref).not.toHaveBeenCalled();
  });
});

describe("ControlBoardPanel: metric tiles", () => {
  it("scopes the triage tile as 'Items Needing Action', apart from the KPI strip's 'Submittals Needing Action'", () => {
    renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]));
    expect(screen.getByText("Items Needing Action")).toBeInTheDocument();
    expect(screen.queryByText("Needs Action")).not.toBeInTheDocument();
  });
});

describe("ControlBoardPanel: without onOpenHref", () => {
  it("rows and Open Work fall back to onOpenTab(routeTab)", () => {
    const { onOpenTab } = renderBoard(triageFor([LINKED_SUBMITTAL, UNLINKED_SUBMITTAL]), { inHub: false });

    fireEvent.click(queueRow(/Main Steel/));
    fireEvent.keyDown(queueRow(/Main Steel/), { key: "Enter" });
    fireEvent.click(queueRow(/SUB-002 - Embed plates/));
    fireEvent.click(screen.getByRole("button", { name: /Open Work/ }));

    expect(onOpenTab.mock.calls).toEqual([["drawings"], ["drawings"], ["submittals"], ["drawings"]]);
    expect(location()).toBe(HUB);
  });

  it("Create submittal falls back to the standalone Submittals page", () => {
    const { onOpenTab } = renderBoard(triageFor([]), { inHub: false });
    fireEvent.click(screen.getByRole("button", { name: "Create submittal" }));
    expect(location()).toBe("/Submittals?targetSetId=set-open");
    expect(onOpenTab).not.toHaveBeenCalled();
  });
});
