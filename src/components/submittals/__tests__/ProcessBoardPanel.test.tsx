// @vitest-environment jsdom
/**
 * ProcessBoardPanel: record deep links (owner decision 3, 2026-09-11).
 *
 * Inside the hub (inHub), a card opens its record: the governing submittal,
 * else its set's Sets & revisions view. The nested Create submittal pill opens
 * create on the hub's Submittal Register and never also fires its card.
 * Outside the hub both keep their old targets.
 */
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import ProcessBoardPanel from "../ProcessBoardPanel";
import { buildSetPackages } from "@/pages/drawingSubmittalHub/format";

const SETS = [
  { id: "set-linked", set_name: "Main Steel" },
  { id: "set-open", set_name: "Anchor Bolts" },
];
const DRAWINGS = [
  { id: "d1", drawing_set_id: "set-linked", stage: "IFA" },
  { id: "d2", drawing_set_id: "set-open", stage: "IFA" },
];
const SUBMITTALS = [
  {
    id: "sub-1",
    drawing_set_ids: ["set-linked"],
    status: "Under Review",
    ball_in_court: "EOR",
    submittal_number: "SUB-001",
    submitted_date: "2026-08-01",
    required_date: "2099-01-01",
  },
  {
    id: "sub-2",
    drawing_set_ids: [] as string[],
    status: "Submitted",
    ball_in_court: "EOR",
    submittal_number: "SUB-002",
    title: "Embed plates",
    required_date: "2099-01-01",
  },
];

const PROCESS = "/DrawingSubmittalHub?hub_tab=process";
const RECORD_SUB_1 = "/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-1";
const RECORD_SUB_2 = "/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-2";
const SETS_VIEW = "/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets&set=set-open";
const CREATE_SET_OPEN = "/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set-open";

// Every location the router lands on, in order, so a second navigation (the
// card firing after its pill) can't hide behind the final URL.
let visits: string[] = [];

afterEach(() => {
  cleanup();
  visits = [];
});

function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    visits.push(location.pathname + location.search);
  }, [location]);
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderBoard({ inHub = true }: { inHub?: boolean } = {}) {
  const onOpenTab = vi.fn();
  render(
    <MemoryRouter initialEntries={[PROCESS]}>
      <ProcessBoardPanel
        setPackages={buildSetPackages(DRAWINGS as any, SETS as any, SUBMITTALS as any)}
        submittals={SUBMITTALS}
        onOpenTab={onOpenTab}
        inHub={inHub}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onOpenTab };
}

const card = (name: RegExp) => screen.getByRole("button", { name });
const createPill = () => screen.getByRole("link", { name: "Create submittal" });
const location = () => screen.getByTestId("location").textContent;

describe("ProcessBoardPanel: in the hub", () => {
  it("a set card opens its governing submittal's record", () => {
    const { onOpenTab } = renderBoard();
    fireEvent.click(card(/Main Steel/));
    expect(location()).toBe(RECORD_SUB_1);
    expect(onOpenTab).not.toHaveBeenCalled();
  });

  it("an unlinked submittal's card opens its own record", () => {
    renderBoard();
    fireEvent.click(card(/SUB-002 - Embed plates/));
    expect(location()).toBe(RECORD_SUB_2);
  });

  it("a set card with no submittal opens Drawing Register › Sets & revisions", () => {
    renderBoard();
    fireEvent.click(card(/Anchor Bolts/));
    expect(location()).toBe(SETS_VIEW);
  });

  const PRESSES: Array<[string, (el: HTMLElement) => void]> = [
    ["a click", (el) => { fireEvent.click(el); }],
    ["Enter", (el) => { fireEvent.keyDown(el, { key: "Enter" }); }],
    ["Space", (el) => { fireEvent.keyDown(el, { key: " " }); }],
  ];

  it.each(PRESSES)("the create pill opens create in the hub on %s, and doesn't also fire its card", (_press, press) => {
    const { onOpenTab } = renderBoard();
    press(createPill());
    // Exactly one navigation: the card's own (Sets & revisions) never ran.
    expect(visits).toEqual([PROCESS, CREATE_SET_OPEN]);
    expect(onOpenTab).not.toHaveBeenCalled();
  });
});

describe("ProcessBoardPanel: outside the hub", () => {
  it("a card calls onOpenTab with its tab, and the create pill opens /Submittals", () => {
    const { onOpenTab } = renderBoard({ inHub: false });

    fireEvent.click(card(/Main Steel/));
    fireEvent.click(card(/Anchor Bolts/));
    expect(onOpenTab.mock.calls).toEqual([["submittals"], ["drawings"]]);
    expect(location()).toBe(PROCESS);

    fireEvent.click(createPill());
    expect(visits).toEqual([PROCESS, "/Submittals?targetSetId=set-open"]);
    expect(onOpenTab).toHaveBeenCalledTimes(2);
  });
});
