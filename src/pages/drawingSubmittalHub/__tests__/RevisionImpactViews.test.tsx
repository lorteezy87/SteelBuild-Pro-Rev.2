// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RevisionImpactViews from "../RevisionImpactViews";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";

const impactCalls = vi.hoisted(() => [] as (string | null)[]);
vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => ({ data: [] as DrawingRegisterRow[], isLoading: false }),
}));
vi.mock("@/hooks/useDrawingImpacts", () => ({
  useDrawingImpacts: (projectId: string | null) => {
    impactCalls.push(projectId);
    return { data: [] as DrawingImpactRow[], isLoading: false, error: null as Error | null };
  },
}));

const HUB = "/DrawingSubmittalHub?hub_tab=revimpact";

// One computed row, as the hub's buildRevisionImpactRows shapes it.
const ROW = {
  revisionId: "rev-2",
  drawingId: "d-1",
  sheetNumber: "S-101",
  setName: "Main steel",
  revisionCode: "B",
  severity: "high",
  wpNames: [] as string[],
  rfiCount: 0,
  openRfiCount: 0,
  fabBlocked: false,
  affectedPieces: null as number | null,
};

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="pathname">{location.pathname}</output>
      <output data-testid="search">{location.search}</output>
      <output data-testid="nav-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>probe-back</button>
    </div>
  );
}

function mount({ entries = [HUB] }: { entries?: string[] } = {}) {
  const onCompareRevision = vi.fn();
  render(
    <MemoryRouter initialEntries={entries}>
      <QueryClientProvider client={new QueryClient()}>
        <RevisionImpactViews projectId="p1" rows={[ROW]} onCompareRevision={onCompareRevision} rosterLoaded={false} />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return onCompareRevision;
}

describe("Revision Impact views (?hub_view=)", () => {
  beforeEach(() => {
    impactCalls.length = 0;
  });

  it("opens on the computed board, names its source, and Compare still opens the overlay", async () => {
    const user = userEvent.setup();
    const onCompareRevision = mount();

    expect(screen.getByRole("group", { name: "Revision impact source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Computed from revisions" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Impact log" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Derived from drawing revisions and downstream status/)).toBeInTheDocument();
    expect(screen.getByText("S-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(onCompareRevision).toHaveBeenCalledWith("d-1");
    // The manual log isn't loaded until it's opened.
    expect(impactCalls).toEqual([]);
  });

  it("opens the manual impact log from ?hub_view=log, for the tab's project", async () => {
    mount({ entries: [`${HUB}&hub_view=log`] });

    expect(await screen.findByRole("heading", { name: "Impact Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Impact log" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Manually logged drawing impacts/)).toBeInTheDocument();
    expect(screen.queryByText("S-101")).not.toBeInTheDocument();
    expect(impactCalls).toContain("p1");
  });

  it("switches source by rewriting the current entry, never adding history", async () => {
    const user = userEvent.setup();
    mount({ entries: ["/start", HUB] });

    await user.click(screen.getByRole("button", { name: "Impact log" }));
    expect(await screen.findByRole("heading", { name: "Impact Board" })).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=revimpact&hub_view=log");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");

    // The default source is written as no hub_view at all.
    await user.click(screen.getByRole("button", { name: "Computed from revisions" }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=revimpact");
    expect(screen.getByText("S-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/start");
  });

  it("does nothing when the current source is clicked again", async () => {
    const user = userEvent.setup();
    mount({ entries: [`${HUB}&hub_view=log`] });
    await user.click(await screen.findByRole("button", { name: "Impact log" }));
    expect(screen.getByTestId("nav-type")).toHaveTextContent("POP");
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=revimpact&hub_view=log");
  });
});
