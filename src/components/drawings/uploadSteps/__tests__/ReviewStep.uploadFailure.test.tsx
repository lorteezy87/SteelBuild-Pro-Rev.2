// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn() }));
vi.mock("@/lib/crossSetSupersedeRepository", () => repo);
vi.mock("@/components/drawings/intakeReview", () => ({
  sheetReviewFlags: () => ({ needsReview: false, reasons: [] as string[] }),
}));

import ReviewStep from "../ReviewStep";

interface FileResult {
  fileName: string;
  status?: string;
  error?: string;
  scanned?: boolean;
  tooLarge?: boolean;
  extractFailed?: boolean;
  sizeMB?: number;
}

const sheetFrom = (file: string, sheetNumber: string) => ({
  sheetNumber,
  sheetTitle: "Framing Plan",
  revision: "1",
  discipline: "Structural",
  sourceFile: file,
  sourceFileUrl: `app-files/${file}`,
  selected: true,
});

function Harness({ fileResults, sheets: initial }: { fileResults: FileResult[]; sheets: ReturnType<typeof sheetFrom>[] }) {
  const [sheets, setSheets] = useState(initial);
  const [meta, setMeta] = useState({
    setName: "Main Steel", setNumber: "", revision: "A",
    issueDate: "2026-10-20", issuedBy: "", discipline: "Structural",
  });
  return (
    <ReviewStep
      sheets={sheets}
      setSheets={setSheets}
      fileResults={fileResults}
      meta={meta}
      setMeta={setMeta}
      aiFilledFields={{}}
      onBack={() => {}}
      onCreate={() => {}}
      existingDrawings={[]}
      canSupersede={false}
      projectId="p1"
    />
  );
}

function mount(fileResults: FileResult[], sheets = [sheetFrom("good.pdf", "S-101")]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness fileResults={fileResults} sheets={sheets} />
    </QueryClientProvider>,
  );
}

/**
 * The regression this covers:
 *
 * `warnedFiles` filtered on `scanned || tooLarge || extractFailed`. A file
 * whose UPLOAD failed carries `status: "failed"` and none of those flags, so
 * in a mixed batch it matched nothing and this screen showed no warning at
 * all. The set was then created silently missing those pages — and the shop
 * works from the register that results.
 */
describe("ReviewStep — a file that failed to upload", () => {
  it("warns that the set will be missing that file's sheets", () => {
    mount([
      { fileName: "good.pdf", status: "success" },
      { fileName: "dropped.pdf", status: "failed", error: "File upload timed out after 90s — please retry" },
    ]);
    expect(screen.getByText("dropped.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(/did not upload, so none of its sheets are in the list below/),
    ).toBeInTheDocument();
  });

  it("shows the underlying reason, not just that it failed", () => {
    mount([
      { fileName: "good.pdf", status: "success" },
      { fileName: "dropped.pdf", status: "failed", error: "new row violates row-level security policy" },
    ]);
    expect(
      screen.getByText("new row violates row-level security policy"),
    ).toBeInTheDocument();
  });

  it("falls back to a stated reason when the error is empty", () => {
    mount([{ fileName: "dropped.pdf", status: "failed", error: "" }]);
    expect(screen.getByText("Upload failed for an unknown reason.")).toBeInTheDocument();
  });

  it("stays silent when every file uploaded", () => {
    mount([{ fileName: "good.pdf", status: "success" }]);
    expect(
      screen.queryByText(/did not upload, so none of its sheets are in the list below/),
    ).not.toBeInTheDocument();
  });

  // The soft-warning path is a different class and must keep its own amber
  // copy: an extractFailed file DOES contribute an editable sheet row.
  it("keeps the soft extraction warning separate from an upload failure", () => {
    mount([
      { fileName: "scanned.pdf", status: "success", extractFailed: true, error: "AI extraction timed out" },
    ]);
    expect(screen.getByText(/could not be auto-extracted by AI/)).toBeInTheDocument();
    expect(
      screen.queryByText(/did not upload, so none of its sheets are in the list below/),
    ).not.toBeInTheDocument();
  });
});
