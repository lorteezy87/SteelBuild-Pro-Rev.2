// @vitest-environment jsdom
//
// Import-flow integration test (the E2E reliability harness for the moat
// import): drives the REAL DrawingLogImportModal end to end — upload a log →
// SheetJS parse → parseDrawingLog → staged review → commit — with Supabase
// mocked, asserting the set + sheet creation actually fire. Closes the gap that
// unit tests (parsers) don't cover: the modal's file→parse→review→commit wiring.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom's File.arrayBuffer is unreliable across versions — give the test File a
// deterministic one so SheetJS reads the bytes we put in.
function csvFile(text, name) {
  const file = new File([text], name, { type: "text/csv" });
  file.arrayBuffer = async () => new TextEncoder().encode(text).buffer;
  return file;
}

const drawingFilter = vi.fn().mockResolvedValue([]);
const setFilter = vi.fn().mockResolvedValue([]);
const createDrawing = vi.fn().mockResolvedValue({ id: "dwg-new" });
const createSet = vi.fn().mockResolvedValue({ id: "set-new", set_name: "ANCHOR BOLT & ERECTION DRAWINGS" });

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Drawing: { filter: (...a) => drawingFilter(...a), create: (...a) => createDrawing(...a) },
    DrawingSet: { filter: (...a) => setFilter(...a), create: (...a) => createSet(...a) },
  },
}));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import DrawingLogImportModal from "@/components/drawings/DrawingLogImportModal";

const LOG_CSV = [
  "Academy MS Mesa,,,,,,,,,,",
  ",,,,,,,,,,",
  "S.N,Description,Drawing No,Rev.,Date Sent of Approval,Date Sent of Fab/Field,Remark,MOD,DET,CHK,Sheet Size",
  "ANCHOR BOLT & ERECTION DRAWINGS,,,,,,,,,,",
  "1,ANCHOR BOLT LAYOUT PLAN,101ABP1,1,14-Nov-25,29-Jan-26,For Field Use,,HNI,YHW,24x36",
  "2,DETAILS & SECTIONS,101ABP2,1,14-Nov-25,29-Jan-26,For Field Use,,HNI,YHW,24x36",
].join("\n");

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DrawingLogImportModal open projectId="p1" projectName="Test Project" onClose={() => {}} onImported={() => {}} />
    </QueryClientProvider>,
  );
}

describe("DrawingLogImportModal — import flow", () => {
  beforeEach(() => { vi.clearAllMocks(); drawingFilter.mockResolvedValue([]); setFilter.mockResolvedValue([]); });

  it("uploads a log, shows the staged sheets, and commits them on import", async () => {
    const user = userEvent.setup();
    renderModal();

    // 1. upload the log file through the real file input
    await user.upload(document.querySelector('input[type="file"]'), csvFile(LOG_CSV, "DrawingLog.csv"));

    // 2. parse → staged review
    await user.click(await screen.findByRole("button", { name: /Review sheets/i }));
    await waitFor(() => expect(screen.getByText("101ABP1")).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByText("101ABP2")).toBeInTheDocument();
    // both are NEW (no existing drawings) and carry the category
    expect(screen.getAllByText(/NEW/i).length).toBeGreaterThanOrEqual(2);

    // 3. commit → a category set is created, then the sheets
    await user.click(screen.getByRole("button", { name: /Import 2 sheets/i }));
    await waitFor(() => expect(createDrawing).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(createSet).toHaveBeenCalled();

    // the created sheets carry their parsed fields + the category set
    // (creates run via Promise.allSettled — match by sheet, not call order)
    const sheets = createDrawing.mock.calls.map((c) => c[0]);
    const abp1 = sheets.find((s) => s.sheet_number === "101ABP1");
    expect(abp1).toMatchObject({
      project_id: "p1",
      drawing_set_name: "ANCHOR BOLT & ERECTION DRAWINGS",
      submitted_date: "2025-11-14",
    });
  });

  it("surfaces a parse error for a file with no Drawing No column", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(document.querySelector('input[type="file"]'), csvFile("foo,bar\n1,2", "bad.csv"));
    await user.click(await screen.findByRole("button", { name: /Review sheets/i }));
    await waitFor(() => expect(screen.getByText(/Drawing No|couldn.t|no .*sheets|column/i)).toBeInTheDocument(), { timeout: 4000 });
    expect(createDrawing).not.toHaveBeenCalled();
  });
});
