// @vitest-environment jsdom
//
// Bidirectional Section Cut <-> Sheet navigation in the viewer's context panel.
//
// "References Out" existed as "Detected Callouts" and resolved each entry with
// a per-callout allDrawings.find(). "Referenced By" is new: nothing in the app
// could previously answer what points AT a sheet, which is the direction a
// detailer needs when a detail changes and they have to find every plan sheet
// that calls it out.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { filter: async (): Promise<unknown[]> => [] } },
}));
vi.mock("@/components/drawings/SignoffStampPanel", () => ({ default: (): null => null }));
vi.mock("@/utils", () => ({ createPageUrl: (s: string) => `/${s}` }));

import ContextPanel from "../ContextPanel";
import type { StoredCallout } from "@/lib/sectionCutLinks";

/** The register row shape ContextPanel reads. */
interface Row {
  id: string;
  project_id: string;
  sheet_number: string;
  title: string;
  callouts: StoredCallout[] | null;
}

const onSelect = vi.fn();

const callout = (target: string, text: string): StoredCallout => ({
  targetSheetNumber: target,
  text,
  coords: { x: 1, y: 2, width: 3, height: 4 },
});

const PLAN_A: Row = {
  id: "plan-a", project_id: "p1", sheet_number: "S-101", title: "Low roof framing",
  callouts: [callout("S-401", "3/S-401")],
};
const PLAN_B: Row = {
  id: "plan-b", project_id: "p1", sheet_number: "S-102", title: "High roof framing",
  callouts: [callout("S-401", "5/S-401")],
};
const DETAIL: Row = {
  id: "detail", project_id: "p1", sheet_number: "S-401", title: "Connection details",
  callouts: [],
};

function renderPanel(active: Row | Record<string, unknown>, all: Row[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextPanel activeDrawing={active} allDrawings={all} onSelect={onSelect} onClose={() => {}} drawingRevisionId={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: RegExp) => screen.getByText(name).closest("div")!.parentElement!;

beforeEach(() => onSelect.mockClear());

describe("References Out — sheet to its section cuts", () => {
  it("labels a bubble reference as detail/sheet, not the raw printed sentence", () => {
    renderPanel(PLAN_A, [PLAN_A, PLAN_B, DETAIL]);
    expect(screen.getByText("3/S-401")).toBeInTheDocument();
  });

  it("navigates to the referenced sheet on click", async () => {
    renderPanel(PLAN_A, [PLAN_A, PLAN_B, DETAIL]);
    await userEvent.click(screen.getByText("3/S-401"));
    expect(onSelect).toHaveBeenCalledWith("detail");
  });

  it("shows a dangling reference as unmatched and NOT clickable, never hidden", async () => {
    renderPanel(PLAN_A, [PLAN_A]); // S-401 not uploaded
    expect(screen.getByText("3/S-401")).toBeInTheDocument();
    expect(screen.getByText(/S-401 not in this register/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("3/S-401"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says a sheet was never scanned rather than reporting it clean", () => {
    renderPanel({ ...PLAN_A, callouts: null }, [{ ...PLAN_A, callouts: null }, DETAIL]);
    expect(screen.getByText(/has not been scanned for callouts yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No cross-sheet callouts detected/)).not.toBeInTheDocument();
  });
});

describe("Referenced By — detail sheet back to the plans that call it", () => {
  it("lists every sheet that calls out this one", () => {
    renderPanel(DETAIL, [PLAN_A, PLAN_B, DETAIL]);
    const refBy = section(/Referenced By/);
    expect(within(refBy).getByText("S-101")).toBeInTheDocument();
    expect(within(refBy).getByText("S-102")).toBeInTheDocument();
    expect(within(refBy).getByText("Detail 3")).toBeInTheDocument();
    expect(within(refBy).getByText("Detail 5")).toBeInTheDocument();
  });

  it("navigates back to the referencing sheet on click", async () => {
    renderPanel(DETAIL, [PLAN_A, PLAN_B, DETAIL]);
    await userEvent.click(within(section(/Referenced By/)).getByText("S-101"));
    expect(onSelect).toHaveBeenCalledWith("plan-a");
  });

  it("states plainly when nothing references the sheet and the register was whole", () => {
    renderPanel(DETAIL, [DETAIL]);
    expect(screen.getByText(/No other sheet in this register calls out this sheet/)).toBeInTheDocument();
  });

  it("refuses to claim 'nothing references this' when the register read was capped", () => {
    // 1,000 rows = the cap, so a referencing sheet may simply never have been read.
    const capped: Row[] = [DETAIL, ...Array.from({ length: 999 }, (_, i): Row => ({
      id: `filler-${i}`, project_id: "p1", sheet_number: `X-${i}`, title: "", callouts: [],
    }))];
    renderPanel(DETAIL, capped);
    expect(screen.getByText(/register read was capped/)).toBeInTheDocument();
    expect(screen.queryByText(/No other sheet in this register calls out this sheet/)).not.toBeInTheDocument();
  });
});

describe("edge cases the spec calls out", () => {
  it("one section cut appearing on multiple sheets resolves both ways", () => {
    renderPanel(DETAIL, [PLAN_A, PLAN_B, DETAIL]);
    expect(within(section(/Referenced By/)).getAllByRole("button")).toHaveLength(2);
  });

  it("multiple section cuts on a single sheet are listed separately", () => {
    const multi = { ...PLAN_A, callouts: [callout("S-401", "3/S-401"), callout("S-401", "4/S-401")] };
    renderPanel(multi, [multi, DETAIL]);
    expect(screen.getByText("3/S-401")).toBeInTheDocument();
    expect(screen.getByText("4/S-401")).toBeInTheDocument();
  });

  it("a duplicate printing of the same reference collapses to one row", () => {
    const dupe = { ...PLAN_A, callouts: [callout("S-401", "3/S-401"), callout("S401", "3/S401")] };
    renderPanel(dupe, [dupe, DETAIL]);
    expect(screen.getAllByText("3/S-401")).toHaveLength(1);
  });

  it("a renumbered target goes unmatched rather than silently retargeting", () => {
    const renamed = { ...DETAIL, sheet_number: "S-401A" };
    renderPanel(PLAN_A, [PLAN_A, renamed]);
    expect(screen.getByText(/S-401 not in this register/)).toBeInTheDocument();
    expect(within(section(/References Out/)).getByText("Unmatched")).toBeInTheDocument();
  });
});
