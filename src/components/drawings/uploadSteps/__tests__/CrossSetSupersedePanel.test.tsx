// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => repo);

import CrossSetSupersedePanel from "../CrossSetSupersedePanel";
import { useCrossSetSupersede } from "../../upload/useCrossSetSupersede";
import type { CrossSetSource, CrossSetSourceDrawing, UploadSheetLike } from "@/lib/crossSetSupersede";

const drawing = (id: string, setId: string, setName: string, sheetNumber: string, title: string, stage = "Released"): CrossSetSourceDrawing => ({
  id, drawing_set_id: setId, drawing_set_name: setName, sheet_number: sheetNumber, title,
  revision_number: "1", stage, is_superseded: false, is_deleted: false, metadata: null,
});
const SOURCE: CrossSetSource = {
  sets: [
    { id: "set-l2", set_name: "Main Steel – L2", is_locked: false },
    { id: "set-lad", set_name: "Ladders - Bldg. 2", is_locked: false },
    { id: "set-canopy", set_name: "Canopy", is_locked: true },
  ],
  drawings: [
    drawing("old-201", "set-l2", "Main Steel – L2", "S-201", "FRAMING PLAN"),
    drawing("old-204", "set-l2", "Main Steel – L2", "S-204", "SECTIONS", "IFC"),
    drawing("old-209", "set-l2", "Main Steel – L2", "S-209", "DETAILS"),
    drawing("old-212", "set-l2", "Main Steel – L2", "S-212", "ROOF PLAN"),
    drawing("lad-204", "set-lad", "Ladders - Bldg. 2", "S-204", "LADDER L-1 LAYOUT"),
    drawing("canopy-209", "set-canopy", "Canopy", "S-209", "DETAILS"),
  ],
};
const SHEETS: UploadSheetLike[] = [
  { sheetNumber: "S-201", sheetTitle: "Framing Plan", revision: "2", selected: true },
  { sheetNumber: "S-204", sheetTitle: "Sections", revision: "2", selected: true },
  { sheetNumber: "S-209", sheetTitle: "Details", revision: "2", selected: true },
  { sheetNumber: "S212", sheetTitle: "", revision: "2", selected: true },
];
const META = { setName: "Main Steel – L2 Rev A", revision: "A" };

function Harness({ canSupersede }: { canSupersede: boolean }) {
  const crossSet = useCrossSetSupersede({ projectId: "p1", sheets: SHEETS, meta: META });
  return (
    <CrossSetSupersedePanel
      status={crossSet.status}
      plan={crossSet.plan}
      canSupersede={canSupersede}
      isChecked={crossSet.isChecked}
      onToggle={crossSet.toggle}
      onToggleGroup={crossSet.toggleGroup}
      onSelectAll={crossSet.selectAll}
      onClear={crossSet.clear}
      onRetry={crossSet.retry}
    />
  );
}

function mount(canSupersede = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness canSupersede={canSupersede} /></QueryClientProvider>);
}

const rowBox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const groupBox = () => screen.getByRole("checkbox", { name: /replace pages in Main Steel – L2/ }) as HTMLInputElement;

beforeEach(() => {
  repo.fetchCrossSetSource.mockReset();
  repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
});

describe("CrossSetSupersedePanel", () => {
  it("shows the approved sentence and one row per old page with the details to decide", async () => {
    mount();
    expect(await screen.findByRole("checkbox", {
      name: "S-201, S-204 and S-209 replace pages in Main Steel – L2. Mark the old ones superseded?",
    })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pages this upload replaces" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Main Steel – L2" });
    const row212 = within(table).getByText("S-212").closest("tr") as HTMLElement;
    expect(within(row212).getByText("→ S212")).toBeInTheDocument();
    expect(within(row212).getByText("ROOF PLAN")).toBeInTheDocument();
    expect(within(row212).getByText("— no title —")).toBeInTheDocument();
    expect(within(row212).getByText("Title missing — compare the drawings before ticking")).toBeInTheDocument();
    const row204 = within(table).getByText("S-204").closest("tr") as HTMLElement;
    expect(within(row204).getByText("Main Steel – L2")).toBeInTheDocument();
    expect(within(row204).getByText("1 → 2")).toBeInTheDocument();
    expect(within(row204).getByText("IFC")).toBeInTheDocument();
  });

  it("ticks by the default rules, disables locked sets and tucks different drawings away unticked", async () => {
    mount();
    await screen.findByRole("heading", { name: "Pages this upload replaces" });
    expect(rowBox("Mark S-201 in Main Steel – L2 superseded").checked).toBe(true);
    expect(rowBox("Mark S-204 in Main Steel – L2 superseded").checked).toBe(true);
    expect(rowBox("Mark S-209 in Main Steel – L2 superseded").checked).toBe(true);
    const missing = rowBox("Mark S-212 in Main Steel – L2 superseded");
    expect(missing.checked).toBe(false);
    expect(missing).toHaveAccessibleDescription("Title missing — compare the drawings before ticking");

    const locked = rowBox("Mark S-209 in Canopy superseded");
    expect(locked.disabled).toBe(true);
    expect(locked.checked).toBe(false);
    expect(locked).toHaveAccessibleDescription("Set is locked");

    const different = rowBox("Mark S-204 in Ladders - Bldg. 2 superseded");
    expect(different.checked).toBe(false);
    expect(different.closest("details")).not.toBeNull();
    expect(screen.getByText("1 sheet shares a number with a different drawing — not superseded")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 will be marked superseded")).toBeInTheDocument();
  });

  it("group checkbox is tri-state; Select all, Clear and row toggles update the count", async () => {
    mount();
    await screen.findByRole("heading", { name: "Pages this upload replaces" });
    expect(groupBox().indeterminate).toBe(true);
    expect(groupBox().checked).toBe(false);

    fireEvent.click(groupBox());
    expect(groupBox().checked).toBe(true);
    expect(groupBox().indeterminate).toBe(false);
    expect(rowBox("Mark S-212 in Main Steel – L2 superseded").checked).toBe(true);
    expect(screen.getByText("4 of 5 will be marked superseded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all pages to supersede" }));
    expect(screen.getByText("0 of 5 will be marked superseded")).toBeInTheDocument();
    expect(groupBox().checked).toBe(false);
    expect(groupBox().indeterminate).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Select all pages to supersede" }));
    expect(screen.getByText("4 of 5 will be marked superseded")).toBeInTheDocument();
    expect(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded").checked).toBe(false);

    fireEvent.click(rowBox("Mark S-209 in Main Steel – L2 superseded"));
    expect(rowBox("Mark S-209 in Main Steel – L2 superseded").checked).toBe(false);
    expect(groupBox().indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", {
      name: "S-201, S-204 and S212 replace pages in Main Steel – L2. Mark the old ones superseded?",
    })).toBeInTheDocument();

    fireEvent.click(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded"));
    expect(screen.getByText("4 of 5 will be marked superseded")).toBeInTheDocument();
    expect(screen.getByText(/Releasing Main Steel – L2 and Ladders - Bldg\. 2 again as a set will need an admin override/)).toBeInTheDocument();
  });

  it("read-only users see the rows but no checkboxes", async () => {
    mount(false);
    await screen.findByRole("heading", { name: "Pages this upload replaces" });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("You need PM access to mark pages superseded — the old pages will stay live.")).toBeInTheDocument();
    expect(screen.getByText("S-201, S-204 and S-209 replace pages in Main Steel – L2.")).toBeInTheDocument();
  });

  it("renders nothing when no other set shares these numbers", async () => {
    repo.fetchCrossSetSource.mockResolvedValue({ sets: SOURCE.sets, drawings: [] });
    const { container } = mount();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(repo.fetchCrossSetSource).toHaveBeenCalledWith("p1");
    expect(container).toBeEmptyDOMElement();
  });
});
