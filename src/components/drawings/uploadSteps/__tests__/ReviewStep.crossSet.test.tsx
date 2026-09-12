// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => repo);
vi.mock("@/components/drawings/intakeReview", () => ({
  sheetReviewFlags: () => ({ needsReview: false, reasons: [] as string[] }),
}));

import ReviewStep from "../ReviewStep";
import type { CrossSetSource, CrossSetSourceDrawing } from "@/lib/crossSetSupersede";

const drawing = (id: string, sheetNumber: string, title: string): CrossSetSourceDrawing => ({
  id, drawing_set_id: "set-l2", drawing_set_name: "Main Steel – L2", sheet_number: sheetNumber, title,
  revision_number: "1", is_superseded: false, is_deleted: false, metadata: null,
});
const SOURCE: CrossSetSource = {
  sets: [{ id: "set-l2", set_name: "Main Steel – L2", is_locked: false }],
  drawings: [drawing("old-201", "S-201", "FRAMING PLAN"), drawing("old-204", "S-204", "SECTIONS"), drawing("old-209", "S-209", "DETAILS")],
};
const uploadSheet = (sheetNumber: string, sheetTitle: string) => ({
  sheetNumber, sheetTitle, revision: "2", discipline: "Structural", sourceFile: "rev-a.pdf", sourceFileUrl: "app-files/rev-a.pdf", selected: true,
});
const SHEETS = [uploadSheet("S-201", "Framing Plan"), uploadSheet("S-204", "Sections"), uploadSheet("S-209", "")];

function Harness({ onCreate, canSupersede = true }: { onCreate: (...args: unknown[]) => void; canSupersede?: boolean }) {
  const [sheets, setSheets] = useState(SHEETS);
  const [meta, setMeta] = useState({
    setName: "Main Steel – L2 Rev A", setNumber: "", revision: "A", issueDate: "2026-09-11", issuedBy: "", discipline: "Structural",
  });
  return (
    <ReviewStep
      sheets={sheets}
      setSheets={setSheets}
      fileResults={[{ fileName: "rev-a.pdf" }]}
      meta={meta}
      setMeta={setMeta}
      aiFilledFields={{}}
      onBack={() => {}}
      onCreate={onCreate}
      existingDrawings={[]}
      canSupersede={canSupersede}
      projectId="p1"
    />
  );
}

function mount(onCreate = vi.fn(), canSupersede = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness onCreate={onCreate} canSupersede={canSupersede} /></QueryClientProvider>);
  return onCreate;
}

beforeEach(() => {
  repo.fetchCrossSetSource.mockReset();
});

describe("ReviewStep — pages this upload replaces", () => {
  it("holds Create until the other sets have been checked", async () => {
    let resolve: (value: CrossSetSource) => void = () => {};
    repo.fetchCrossSetSource.mockReturnValue(new Promise<CrossSetSource>((r) => { resolve = r; }));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Checking other sets for these sheet numbers…");
    expect(screen.getByRole("button", { name: /Checking other sets/ })).toBeDisabled();
    resolve(SOURCE);
    expect(await screen.findByRole("button", { name: /Create 3 Entries/ })).toBeEnabled();
  });

  it("passes the ticked old pages to onCreate, honouring the user's toggles", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    const onCreate = mount();
    const s204 = await screen.findByRole("checkbox", { name: "Mark S-204 in Main Steel – L2 superseded" });
    fireEvent.click(s204);
    fireEvent.click(screen.getByRole("button", { name: /Create 3 Entries/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const [selected, options] = onCreate.mock.calls[0];
    expect((selected as Array<{ sheetNumber: string }>).map((s) => s.sheetNumber)).toEqual(["S-201", "S-204", "S-209"]);
    // S-209 has no title yet, so it is not ticked by default.
    expect(options).toEqual(expect.objectContaining({ supersedeIds: ["old-201"] }));
  });

  it("typing a matching title into a blank-title row flips its default to ticked", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    mount();
    const s209 = await screen.findByRole("checkbox", { name: "Mark S-209 in Main Steel – L2 superseded" });
    expect(s209).not.toBeChecked();
    const row = screen.getByDisplayValue("S-209").closest("tr") as HTMLElement;
    const [, titleInput] = within(row).getAllByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Details" } });
    expect(screen.getByRole("checkbox", { name: "Mark S-209 in Main Steel – L2 superseded" })).toBeChecked();
  });

  it("unticking a sheet in the upload drops its old page from the proposal", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    const onCreate = mount();
    await screen.findByRole("checkbox", { name: "Mark S-201 in Main Steel – L2 superseded" });
    const row = screen.getByDisplayValue("S-201").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.queryByRole("checkbox", { name: "Mark S-201 in Main Steel – L2 superseded" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Create 2 Entries/ }));
    expect(onCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ supersedeIds: ["old-204"] }));
  });

  it("forgets a toggled choice once its row stops matching", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    mount();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark S-204 in Main Steel – L2 superseded" }));
    expect(screen.getByRole("checkbox", { name: "Mark S-204 in Main Steel – L2 superseded" })).not.toBeChecked();
    const numberInput = screen.getByDisplayValue("S-204");
    fireEvent.change(numberInput, { target: { value: "S-299" } });
    expect(screen.queryByRole("checkbox", { name: "Mark S-204 in Main Steel – L2 superseded" })).toBeNull();
    fireEvent.change(numberInput, { target: { value: "S-204" } });
    expect(screen.getByRole("checkbox", { name: "Mark S-204 in Main Steel – L2 superseded" })).toBeChecked();
  });

  it("a tick never follows a page into the different-drawing section", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    const onCreate = mount();
    await screen.findByRole("checkbox", { name: "Mark S-209 in Main Steel – L2 superseded" });
    // S-209 has no title yet, so it isn't ticked by default; Select all ticks it anyway.
    fireEvent.click(screen.getByRole("button", { name: "Select all pages to supersede" }));
    expect(screen.getByRole("checkbox", { name: "Mark S-209 in Main Steel – L2 superseded" })).toBeChecked();
    // Its real title differs from the old page's: a different drawing.
    const row = screen.getByDisplayValue("S-209").closest("tr") as HTMLElement;
    const [, titleInput] = within(row).getAllByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Connection Details" } });
    const moved = screen.getByRole("checkbox", { name: "Mark S-209 in Main Steel – L2 superseded" });
    expect(moved.closest("details")).not.toBeNull();
    expect(moved).not.toBeChecked();
    expect(screen.getByText("1 sheet shares a number with a different drawing — not superseded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create 3 Entries/ }));
    expect(onCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ supersedeIds: ["old-201", "old-204"] }));
  });

  it("a failed check says nothing will be superseded and lets Create go ahead", async () => {
    repo.fetchCrossSetSource.mockRejectedValue(new Error("network down"));
    const onCreate = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check other sets — no pages will be superseded");
    const create = screen.getByRole("button", { name: /Create 3 Entries/ });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(onCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ supersedeIds: [] }));
  });

  it("read-only users never send pages to supersede", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(SOURCE);
    const onCreate = mount(vi.fn(), false);
    await screen.findByText("You need PM access to mark pages superseded — the old pages will stay live.");
    fireEvent.click(screen.getByRole("button", { name: /Create 3 Entries/ }));
    expect(onCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ supersedeIds: [] }));
  });
});
