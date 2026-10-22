// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => repo);
vi.mock("@/components/drawings/intakeReview", () => ({
  sheetReviewFlags: () => ({ needsReview: false, reasons: [] as string[] }),
}));

import ReviewStep from "../ReviewStep";
import type { CrossSetSource, CrossSetSourceDrawing } from "@/lib/crossSetSupersede";

const oldDrawing = (
  id: string,
  sheetNumber: string,
  title: string,
  revision = "1",
): CrossSetSourceDrawing => ({
  id,
  drawing_set_id: "set-old",
  drawing_set_name: "Main Steel",
  sheet_number: sheetNumber,
  title,
  revision_number: revision,
  is_superseded: false,
  is_deleted: false,
  metadata: null,
});

const sourceWith = (drawings: CrossSetSourceDrawing[]): CrossSetSource => ({
  sets: [{ id: "set-old", set_name: "Main Steel", is_locked: false }],
  drawings,
});

const newSheet = (sheetNumber: string, sheetTitle: string, revision = "2") => ({
  sheetNumber,
  sheetTitle,
  revision,
  discipline: "Structural",
  sourceFile: "rev-b.pdf",
  sourceFileUrl: "app-files/rev-b.pdf",
  selected: true,
});

function Harness({ sheets: initial }: { sheets: ReturnType<typeof newSheet>[] }) {
  const [sheets, setSheets] = useState(initial);
  const [meta, setMeta] = useState({
    setName: "Main Steel Rev B", setNumber: "", revision: "B",
    issueDate: "2026-10-21", issuedBy: "", discipline: "Structural",
  });
  return (
    <ReviewStep
      sheets={sheets}
      setSheets={setSheets}
      fileResults={[{ fileName: "rev-b.pdf", status: "success" }]}
      meta={meta}
      setMeta={setMeta}
      aiFilledFields={{}}
      onBack={() => {}}
      onCreate={() => {}}
      existingDrawings={[]}
      canSupersede
      projectId="p1"
    />
  );
}

async function mount(sheets: ReturnType<typeof newSheet>[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness sheets={sheets} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repo.fetchCrossSetSource.mockReset();
});

/**
 * Two gaps these cover, both about a page in another set staying LIVE after a
 * revision set is created — the sheet the shop can still pull.
 *
 * (a) An empty plan used to render nothing, so "no other set holds these
 *     numbers" and "matching found nothing to compare" looked identical.
 * (b) The Create button said only "Create N Entries". Six conditions in
 *     planCrossSetSupersede can each leave a row unticked, so the number of
 *     pages left live was reachable only by reading the panel row by row.
 */
describe("ReviewStep — pages left live", () => {
  it("states that the other sets were checked and matched nothing", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(sourceWith([]));
    await mount([newSheet("S-101", "Framing Plan")]);
    expect(
      await screen.findByText(/no sheets in them match these numbers, so nothing will be superseded/i),
    ).toBeInTheDocument();
  });

  // The signal case: an extraction failure blanks the title, which makes the
  // row title_missing and so unticked by default. The old page stays live and
  // the count has to say so.
  it("counts a page left live when a blank title blocks the default tick", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(
      sourceWith([oldDrawing("old-101", "S-101", "FRAMING PLAN")]),
    );
    await mount([newSheet("S-101", "")]); // title lost to a failed extraction
    expect(await screen.findByText("1 old page stays live")).toBeInTheDocument();
  });

  it("pluralises and totals across several pages left live", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(
      sourceWith([
        oldDrawing("old-101", "S-101", "FRAMING PLAN"),
        oldDrawing("old-102", "S-102", "SECTIONS"),
      ]),
    );
    await mount([newSheet("S-101", ""), newSheet("S-102", "")]);
    expect(await screen.findByText("2 old pages stay live")).toBeInTheDocument();
  });

  // A clean match is ticked by default, so nothing is left live and the warning
  // must not appear — otherwise it becomes noise and stops being read.
  it("says nothing when every matched page will be superseded", async () => {
    repo.fetchCrossSetSource.mockResolvedValue(
      sourceWith([oldDrawing("old-101", "S-101", "Framing Plan")]),
    );
    await mount([newSheet("S-101", "Framing Plan")]);
    expect(await screen.findByRole("button", { name: /Create 1 Entry/ })).toBeInTheDocument();
    expect(screen.queryByText(/old page[s]? stay/i)).not.toBeInTheDocument();
  });

  it("reports the failed check rather than a count it cannot compute", async () => {
    repo.fetchCrossSetSource.mockRejectedValue(new Error("network"));
    await mount([newSheet("S-101", "Framing Plan")]);
    expect(
      await screen.findByText(/Couldn't check other sets — no pages will be superseded/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/old page[s]? stay/i)).not.toBeInTheDocument();
  });
});
