// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => repo);

import CrossSetSupersedePanel from "../CrossSetSupersedePanel";
import { useCrossSetSupersede } from "../../upload/useCrossSetSupersede";
import type { CrossSetSource, CrossSetSourceDrawing, UploadMetaLike, UploadSheetLike } from "@/lib/crossSetSupersede";

const drawing = (id: string, setId: string, setName: string, sheetNumber: string, title: string, revision = "1"): CrossSetSourceDrawing => ({
  id, drawing_set_id: setId, drawing_set_name: setName, sheet_number: sheetNumber, title,
  revision_number: revision, is_superseded: false, is_deleted: false, metadata: null,
});
const SOURCE: CrossSetSource = {
  sets: [
    { id: "set-l2", set_name: "Main Steel – L2", is_locked: false },
    { id: "set-lad", set_name: "Ladders - Bldg. 2", is_locked: false },
    { id: "set-canopy", set_name: "Canopy", is_locked: true },
  ],
  drawings: [
    drawing("old-201", "set-l2", "Main Steel – L2", "S-201", "FRAMING PLAN"),
    drawing("old-204", "set-l2", "Main Steel – L2", "S-204", "SECTIONS"),
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
const META: UploadMetaLike = { setName: "Main Steel – L2 Rev A", revision: "A" };

// A vendor package whose matches are all unlikely: a short number (C1) and a
// stale upload (rev 1 over the live rev 2).
const VENDOR_SOURCE: CrossSetSource = {
  sets: [
    { id: "set-joists", set_name: "Joists", is_locked: false },
    { id: "set-acad", set_name: "Academy MS Mesa", is_locked: false },
  ],
  drawings: [
    drawing("joists-c1", "set-joists", "Joists", "C1", "GENERAL NOTES", "0"),
    drawing("acad-abp1", "set-acad", "Academy MS Mesa", "101ABP1", "ANCHOR BOLT LAYOUT PLAN", "2"),
  ],
};
const VENDOR_SHEETS: UploadSheetLike[] = [
  { sheetNumber: "C1", sheetTitle: "General Notes", revision: "0", selected: true },
  { sheetNumber: "101ABP1", sheetTitle: "Anchor Bolt Layout Plan", revision: "1", selected: true },
];
const VENDOR_META: UploadMetaLike = { setName: "Deck", revision: "0" };

function Harness({ canSupersede, sheets, meta }: { canSupersede: boolean; sheets: UploadSheetLike[]; meta: UploadMetaLike }) {
  const crossSet = useCrossSetSupersede({ projectId: "p1", sheets, meta });
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

function mount(canSupersede = true, sheets = SHEETS, meta = META) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness canSupersede={canSupersede} sheets={sheets} meta={meta} /></QueryClientProvider>);
}

const L2_QUESTION = "S-201, S-204 and S-209 replace pages in Main Steel – L2. Mark the old ones superseded?";
const rowBox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const groupBox = () => screen.getByRole("checkbox", { name: /replace pages in Main Steel – L2/ }) as HTMLInputElement;
const differentSummary = () => screen.getByText(/a number with a different drawing/).closest("summary") as HTMLElement;
const ready = () => screen.findByRole("heading", { name: "Pages this upload replaces" });

beforeEach(() => {
  repo.fetchCrossSetSource.mockReset();
  repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
});

describe("CrossSetSupersedePanel", () => {
  it("shows the approved sentence and one row per old page with the details to decide", async () => {
    mount();
    expect(await screen.findByRole("checkbox", { name: L2_QUESTION })).toBeInTheDocument();
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
  });

  it("has no Stage column — drawings.stage isn't synced from the submittal", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Main Steel – L2" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Supersede", "Sheet", "Old set", "Title (old / new)", "Rev (old → new)", "Note",
    ]);
  });

  it("ticks by the default rules, disables locked sets and tucks different drawings away unticked", async () => {
    mount();
    await ready();
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

  it("the group checkbox asks about, and ticks, only the likely replacements", async () => {
    mount();
    await ready();
    // S-212 (title missing) shares the table but isn't in the question, so the
    // box starts fully ticked, not mixed.
    expect(groupBox().checked).toBe(true);
    expect(groupBox().indeterminate).toBe(false);

    fireEvent.click(rowBox("Mark S-209 in Main Steel – L2 superseded"));
    expect(groupBox().indeterminate).toBe(true);
    expect(groupBox()).toHaveAccessibleName(L2_QUESTION);

    // Answering yes ticks the pages the question names — never S-212.
    fireEvent.click(groupBox());
    expect(groupBox().checked).toBe(true);
    expect(groupBox().indeterminate).toBe(false);
    expect(rowBox("Mark S-209 in Main Steel – L2 superseded").checked).toBe(true);
    expect(rowBox("Mark S-212 in Main Steel – L2 superseded").checked).toBe(false);
    expect(screen.getByText("3 of 5 will be marked superseded")).toBeInTheDocument();

    // A page ticked by hand is its own decision: unticking the group leaves it.
    fireEvent.click(rowBox("Mark S-212 in Main Steel – L2 superseded"));
    fireEvent.click(groupBox());
    expect(groupBox().checked).toBe(false);
    expect(groupBox().indeterminate).toBe(false);
    expect(rowBox("Mark S-201 in Main Steel – L2 superseded").checked).toBe(false);
    expect(rowBox("Mark S-212 in Main Steel – L2 superseded").checked).toBe(true);
    expect(screen.getByText("1 of 5 will be marked superseded")).toBeInTheDocument();
  });

  it("Select all ticks every grouped page but no different drawing; Clear unticks everything", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Clear all pages to supersede" }));
    expect(screen.getByText("0 of 5 will be marked superseded")).toBeInTheDocument();
    expect(groupBox().checked).toBe(false);
    expect(groupBox().indeterminate).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Select all pages to supersede" }));
    expect(screen.getByText("4 of 5 will be marked superseded")).toBeInTheDocument();
    expect(rowBox("Mark S-212 in Main Steel – L2 superseded").checked).toBe(true);
    expect(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded").checked).toBe(false);
  });

  it("never summarises a ticked different drawing as not superseded, and opens its section", async () => {
    mount();
    await ready();
    const details = differentSummary().closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(differentSummary()).toHaveTextContent("1 sheet shares a number with a different drawing — not superseded");

    fireEvent.click(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded"));
    expect(screen.getByText("4 of 5 will be marked superseded")).toBeInTheDocument();
    expect(differentSummary()).toHaveTextContent("1 sheet shares a number with a different drawing — 1 ticked, will be superseded");
    expect(differentSummary()).not.toHaveTextContent("not superseded");
    expect(details.open).toBe(true);

    // Unticking it restores the summary without snapping the open section shut.
    fireEvent.click(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded"));
    expect(differentSummary()).toHaveTextContent("1 sheet shares a number with a different drawing — not superseded");
    expect(details.open).toBe(true);
  });

  it("says what superseding does to releasing the old sets: what is blocked, when, and who can override", async () => {
    mount();
    await ready();
    const note = screen.getByText(/^Superseded pages are left out of fab-release and turnover exports/);
    expect(note).toHaveTextContent(
      "Superseded pages are left out of fab-release and turnover exports, but they block release: " +
      "any such export that includes other pages from Main Steel – L2 needs an override reason from someone with project admin access, " +
      "and moving a submittal that includes Main Steel – L2 to Released for Fabrication (if it isn't there yet) " +
      "needs one from someone with PM access. " +
      "The export override also waives every other export check, including open RFIs and holds; " +
      "the submittal override also waives open RFIs and rejected sheets.",
    );
    // Export overrides are admin-only in production; submittal overrides are PM. No re-release, and no block
    // on a submittal that is already released.
    expect(note).not.toHaveTextContent(/PM override|again|can't be released/i);

    // Any one ticked set blocks the submittal or export that holds it.
    fireEvent.click(rowBox("Mark S-204 in Ladders - Bldg. 2 superseded"));
    expect(note).toHaveTextContent("any such export that includes other pages from Main Steel – L2 or Ladders - Bldg. 2 needs an override reason");
    expect(note).toHaveTextContent("moving a submittal that includes Main Steel – L2 or Ladders - Bldg. 2 to Released for Fabrication");

    // Nothing ticked: nothing will be superseded, so there is nothing to warn about.
    fireEvent.click(screen.getByRole("button", { name: "Clear all pages to supersede" }));
    expect(screen.queryByText(/^Superseded pages are left out/)).toBeNull();
  });

  it("never says a page replaces another when every match in its set is unlikely", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(VENDOR_SOURCE);
    mount(true, VENDOR_SHEETS, VENDOR_META);
    await ready();
    expect(screen.getByText("C1 shares a number with a page in Joists. Compare the drawings before ticking.")).toBeInTheDocument();
    expect(screen.getByText("101ABP1 shares a number with a page in Academy MS Mesa. Compare the drawings before ticking.")).toBeInTheDocument();
    expect(screen.queryByText(/replaces? (a page|pages)/)).toBeNull();
    // No group question to answer: each page is ticked on its own.
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Mark 101ABP1 in Academy MS Mesa superseded", "Mark C1 in Joists superseded",
    ]);
    expect(screen.getByText("0 of 2 will be marked superseded")).toBeInTheDocument();
  });

  it("a locked set's matches get the neutral line without a prompt to tick", async () => {
    mount();
    await ready();
    expect(screen.getByText("S-209 shares a number with a page in Canopy.")).toBeInTheDocument();
  });

  it("read-only users see the rows but no checkboxes", async () => {
    mount(false);
    await ready();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("You need PM access to mark pages superseded — the old pages will stay live.")).toBeInTheDocument();
    expect(screen.getByText("S-201, S-204 and S-209 replace pages in Main Steel – L2.")).toBeInTheDocument();
  });

  it("read-only users get the neutral line for unlikely matches too", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(VENDOR_SOURCE);
    mount(false, VENDOR_SHEETS, VENDOR_META);
    expect(await screen.findByText("C1 shares a number with a page in Joists.")).toBeInTheDocument();
    expect(screen.queryByText(/replaces? (a page|pages)|Compare the drawings/)).toBeNull();
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
