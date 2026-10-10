// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  projectId: "p1",
  drawings: [] as Array<Record<string, unknown>>,
  sets: [] as Array<Record<string, unknown>>,
  extraction: {
    setMeta: {
      projectName: "Desert Ridge Phase 2",
      revision: "IFC",
      issueDate: "04/02/2026",
      authorizingEngineer: "J. Ruiz, P.E.",
    },
    sheets: [
      { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "IFC", date: "04/02/2026", pdfPage: 1 },
    ],
    scanned: false,
    extractFailed: false,
  } as Record<string, unknown>,
  pageTexts: {} as Record<number, string>,
  extractionByName: {} as Record<string, Promise<Record<string, unknown>>>,
  readFailure: false,
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Drawing: {
      filter: vi.fn(async () => m.drawings),
      filterAll: vi.fn(async () => {
        if (m.readFailure) throw new Error("Drawing register read failed");
        return m.drawings;
      }),
    },
    DrawingSet: { filter: vi.fn(async () => m.sets), filterAll: vi.fn(async () => m.sets) },
  },
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "p1", name: "Desert Ridge Phase 2" } }),
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/drawings/RevisionUploadModal", () => ({
  default: ({ preSelectedSet, initialPdfFile, initialAttestations, initialReview, onClose, onComplete }: {
    preSelectedSet?: { id?: string };
    initialPdfFile?: File;
    initialAttestations?: Record<string, { stamp?: { state: string } }>;
    initialReview?: { sheets?: Array<{ manual?: { sheetNumber?: string } }> };
    onClose: () => void;
    onComplete: (result: { complete: boolean; failed: number; historyFailed: number; setWriteFailed?: boolean }) => void;
  }) => (
    <section aria-label="Revision upload wizard">
      <span>Set: {preSelectedSet?.id}</span>
      <span>PDF: {initialPdfFile?.name}</span>
      <span>Reviewed seal: {initialAttestations?.["S-101"]?.stamp?.state ?? "none"}</span>
      <span>Keyed sheet: {initialReview?.sheets?.[0]?.manual?.sheetNumber ?? "none"}</span>
      <button type="button" onClick={onClose}>Close revision wizard</button>
      <button type="button" onClick={() => onComplete({ complete: false, failed: 1, historyFailed: 0 })}>Simulate partial save</button>
      <button type="button" onClick={() => onComplete({ complete: false, failed: 0, historyFailed: 0, setWriteFailed: true })}>Simulate set header failure</button>
    </section>
  ),
}));

vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => m.projectId }));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { full_name: "N. Lortie", email: "n@example.com" } }),
}));

vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(async (file: File) => m.extractionByName[file.name] ?? m.extraction),
}));

vi.mock("@/lib/pdfPageText", () => ({
  readPdfPageTexts: vi.fn(async () => m.pageTexts),
}));

vi.mock("@/lib/docControl/pdfPageCount", () => ({
  readPdfPageCount: vi.fn(async () => 1),
}));

import DocumentControl from "../DocumentControl";
import { entities } from "@/api/supabaseClient";
import { extractSheetsFromPdf } from "@/lib/pdfSheetExtractor";

function GcHubRoute() {
  const location = useLocation();
  return <>
    <span>GC issuance register {location.search}</span>
    {(location.state as { gcPdfIntake?: boolean } | null)?.gcPdfIntake && <span>GC PDF intake requested</span>}
  </>;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter><QueryClientProvider client={client}><Routes>
    <Route path="/" element={children} />
    <Route path="/DrawingSubmittalHub" element={<GcHubRoute />} />
  </Routes></QueryClientProvider></MemoryRouter>;
}

function renderShopControl() {
  const view = render(<DocumentControl />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: /Shop drawing or revision/i }));
  return view;
}

/** Drop a PDF on the zone the way a user does. */
async function dropPdf() {
  const zone = screen.getByLabelText(/Drop a drawing PDF/i);
  const file = new File(["%PDF-1.4"], "revision.pdf", { type: "application/pdf" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  await waitFor(() => expect(screen.getByText("revision.pdf")).toBeTruthy());
}

describe("DocumentControl page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    m.projectId = "p1";
    m.drawings = [
      {
        id: "d1",
        sheet_number: "S-101",
        title: "FOUNDATION PLAN",
        revision_number: "1",
        is_superseded: false,
      },
    ];
    m.sets = [];
    m.pageTexts = {};
    m.extractionByName = {};
    m.readFailure = false;
    m.extraction = {
      setMeta: {
        projectName: "Desert Ridge Phase 2",
        revision: "IFC",
        issueDate: "04/02/2026",
        authorizingEngineer: "J. Ruiz, P.E.",
      },
      sheets: [
        { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "IFC", date: "04/02/2026", pdfPage: 1 },
      ],
      scanned: false,
      extractFailed: false,
    };
  });

  it("says how many live register sheets a document will be checked against", async () => {
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against 1 live sheet/)).toBeTruthy());
  });

  it("places a dropped sheet against the project register, not a single set", async () => {
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();

    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getByText(/Matches live register sheet S-101 at revision 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start revision upload" })).toBeTruthy();
  });

  it("excludes superseded rows from the register it checks against", async () => {
    m.drawings = [{ id: "d1", sheet_number: "S-101", is_superseded: true }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against 0 live sheets/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    // Shown as the register verdict and again as the matching finding.
    expect(screen.getAllByText(/is not in the live register/).length).toBe(2);
  });

  it("fully checks a large register and still selects its exact shop set", async () => {
    m.drawings = Array.from({ length: 1000 }, (_, i) => ({
      id: `d${i}`,
      sheet_number: `X-${i}`,
      is_superseded: false,
    }));
    m.drawings.push({ id: "target", sheet_number: "S-101", revision_number: "1", drawing_set_id: "set1", drawing_set_name: "SHOP A", is_superseded: false });
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against 1,?001 live sheets|Checked against 1001 live sheets/)).toBeTruthy());
    expect(entities.Drawing.filterAll).toHaveBeenCalledWith({ project_id: "p1" }, "id");
    expect(entities.Drawing.filter).not.toHaveBeenCalled();
    await dropPdf();
    expect(screen.queryByText(/register read was capped/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Start revision upload" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not present a failed register read as a complete sheet comparison", async () => {
    m.readFailure = true;
    renderShopControl();
    expect(await screen.findByText(/Drawing register read failed/i)).toBeTruthy();
    await dropPdf();
    expect(screen.getAllByText(/register.*unavailable|register.*incomplete/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Start revision upload" })).toBeNull();
  });

  it("flags an image-only PDF instead of reporting blank title blocks", async () => {
    m.extraction = { ...m.extraction, scanned: true };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    // On the summary chip, and again in the seal / signature bases.
    expect(screen.getAllByText(/image-only/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/nothing could be read from the text layer/i)).toBeTruthy();
  });

  it("detects a seal from that page's harvested text", async () => {
    m.pageTexts = { 1: "REGISTERED PROFESSIONAL ENGINEER LICENSE NO. 45821" };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getByText(/Seal text found in the page text layer/)).toBeTruthy();
  });

  it("diffs the text layer against the sheet of record when both carry harvested text", async () => {
    m.drawings = [
      {
        id: "d1",
        sheet_number: "S-101",
        title: "FOUNDATION PLAN",
        revision_number: "1",
        is_superseded: false,
        extracted_text: "NOTE 1\nWELD 1/4 FILLET",
      },
    ];
    m.extraction = {
      ...m.extraction,
      sheets: [
        {
          sheetNumber: "S-101",
          sheetTitle: "FOUNDATION PLAN",
          revision: "IFC",
          date: "04/02/2026",
          pdfPage: 1,
          extractedText: "NOTE 1\nWELD 5/16 FILLET",
        },
      ],
    };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));

    expect(screen.getByText(/\+ WELD 5\/16 FILLET/)).toBeTruthy();
    expect(screen.getByText(/− WELD 1\/4 FILLET/)).toBeTruthy();
  });

  it("does not diff the seal-detection text, which is a different shape", async () => {
    // pageTexts feeds seal detection only. If it ever leaked into the change
    // summary it would report every sheet as wholly rewritten.
    m.drawings = [
      { id: "d1", sheet_number: "S-101", is_superseded: false, extracted_text: "NOTE 1\nNOTE 2" },
    ];
    m.pageTexts = { 1: "NOTE 1 NOTE 2 REGISTERED PROFESSIONAL ENGINEER" };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));

    const textBullet = screen.getByText(/Text layer not comparable/);
    expect(textBullet).toBeTruthy();
    // The seal still comes from the harvested page text.
    expect(screen.getByText(/Seal text found in the page text layer/)).toBeTruthy();
  });

  it("diffs cross-sheet callouts once both sides carry them", async () => {
    m.drawings = [
      {
        id: "d1",
        sheet_number: "S-101",
        is_superseded: false,
        extracted_text: "NOTE 1",
        callouts: [{ targetSheetNumber: "S-402", text: "SEE S-402" }],
      },
    ];
    m.extraction = {
      ...m.extraction,
      sheets: [
        {
          sheetNumber: "S-101",
          sheetTitle: "FOUNDATION PLAN",
          revision: "IFC",
          pdfPage: 1,
          extractedText: "NOTE 1",
          callouts: [
            { targetSheetNumber: "S-401", text: "SEE S-401", coords: { x: 1, y: 2, width: 3, height: 4 } },
          ],
        },
      ],
    };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));

    const callouts = screen.getByText(/Cross-sheet callouts changed/);
    expect(callouts.textContent).toContain("now references S-401");
    expect(callouts.textContent).toContain("no longer references S-402");
  });

  it("still treats an empty callout list on an unextracted row as unknown", async () => {
    // The legacy case: 0 of the existing rows were ever extracted.
    m.drawings = [{ id: "d1", sheet_number: "S-101", is_superseded: false }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));

    expect(screen.getByText(/unknown rather than empty/)).toBeTruthy();
  });

  it("surfaces an extraction failure rather than an empty result", async () => {
    m.extraction = { extractFailed: true, error: "AI extraction failed" };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());

    const zone = screen.getByLabelText(/Drop a drawing PDF/i);
    const file = new File(["%PDF-1.4"], "bad.pdf", { type: "application/pdf" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText("AI extraction failed")).toBeTruthy());
  });

  it("refuses a file that is not a PDF", async () => {
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());

    const zone = screen.getByLabelText(/Drop a drawing PDF/i);
    const file = new File(["x"], "schedule.xlsx", { type: "application/vnd.ms-excel" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/That is not a PDF/)).toBeTruthy());
  });

  it("routes a GC issuance to the GC hub tab before accepting a PDF", async () => {
    render(<DocumentControl />, { wrapper });
    expect(screen.queryByLabelText(/Drop a drawing PDF/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /GC-issued drawing or document/i }));
    expect(await screen.findByText("GC issuance register ?hub_tab=gc")).toBeTruthy();
    expect(screen.getByText("GC PDF intake requested")).toBeTruthy();
    expect(screen.queryByLabelText(/Drop a drawing PDF/i)).toBeNull();
  });

  it("hands a reviewed PDF and human attestations to the exact shop set", async () => {
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1", revision: "1" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    fireEvent.click(screen.getAllByRole("button", { name: /I see it/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    expect(await screen.findByRole("region", { name: "Revision upload wizard" })).toBeTruthy();
    expect(screen.getByText("Set: set1")).toBeTruthy();
    expect(screen.getByText("PDF: revision.pdf")).toBeTruthy();
    expect(screen.getByText("Reviewed seal: present")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close revision wizard" }));
    expect(screen.getByText("revision.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    expect(screen.getByText("Reviewed seal: present")).toBeTruthy();
  });

  it("keeps its review available and does not claim completion after a partial wizard save", async () => {
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate partial save" }));
    fireEvent.click(screen.getByRole("button", { name: "Close revision wizard" }));
    expect(screen.queryByText(/Revision upload completed/)).toBeNull();
    expect(screen.getByText(/partial revision upload/i)).toBeTruthy();
    expect(screen.getByText("revision.pdf")).toBeTruthy();
  });

  it("names a failed set header separately from sheet and history writes", async () => {
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate set header failure" }));
    fireEvent.click(screen.getByRole("button", { name: "Close revision wizard" }));
    expect(screen.getByText(/set header write failed/i)).toBeTruthy();
    expect(screen.queryByText(/0 sheet write/i)).toBeNull();
    expect(screen.getByText("revision.pdf")).toBeTruthy();
  });

  it("does not hand off a PDF with ambiguous live sheet matches", async () => {
    m.drawings = [m.drawings[0], { ...m.drawings[0], id: "d2" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    expect(screen.queryByRole("button", { name: "Start revision upload" })).toBeNull();
    expect(screen.getByText("Resolve sheet match")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Revision upload wizard" })).toBeNull();
  });

  it("keeps different drawing sets separate when one PDF contains both", async () => {
    m.drawings = [
      { ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" },
      { ...m.drawings[0], id: "d2", sheet_number: "S-201", drawing_set_id: "set2", drawing_set_name: "SHOP B" },
    ];
    m.sets = [
      { id: "set1", set_name: "SHOP A", project_id: "p1" },
      { id: "set2", set_name: "SHOP B", project_id: "p1" },
    ];
    m.extraction = {
      ...m.extraction,
      sheets: [
        { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "2", pdfPage: 1 },
        { sheetNumber: "S-201", sheetTitle: "FRAMING PLAN", revision: "2", pdfPage: 2 },
      ],
    };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    expect(screen.getByText(/different shop drawing sets/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Start revision upload" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("does not assume an unregistered sheet belongs to a matched shop set", async () => {
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1" }];
    m.extraction = {
      ...m.extraction,
      sheets: [
        { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "2", pdfPage: 1 },
        { sheetNumber: "S-999", sheetTitle: "UNKNOWN SET", revision: "2", pdfPage: 2 },
      ],
    };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    expect(screen.getByText(/new sheet.*no proven shop set/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Start revision upload" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("does not pair a replaced PDF with stale extraction results from the first file", async () => {
    let finishFirst!: (value: Record<string, unknown>) => void;
    let finishSecond!: (value: Record<string, unknown>) => void;
    m.extractionByName = {
      "first.pdf": new Promise((resolve) => { finishFirst = resolve; }),
      "second.pdf": new Promise((resolve) => { finishSecond = resolve; }),
    };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    const zone = screen.getByLabelText(/Drop a drawing PDF/i);
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "first.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(vi.mocked(extractSheetsFromPdf)).toHaveBeenCalledTimes(1));
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["b"], "second.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(vi.mocked(extractSheetsFromPdf)).toHaveBeenCalledTimes(2));
    finishSecond({ ...m.extraction, sheets: [{ sheetNumber: "S-101", sheetTitle: "SECOND", pdfPage: 1 }] });
    await waitFor(() => expect(screen.getByText("second.pdf")).toBeTruthy());
    finishFirst({ ...m.extraction, sheets: [{ sheetNumber: "S-201", sheetTitle: "FIRST", pdfPage: 1 }] });
    await waitFor(() => expect(screen.getByText("S-101")).toBeTruthy());
    expect(screen.queryByText("S-201")).toBeNull();
    expect(screen.queryByText("first.pdf")).toBeNull();
  });

  it("lets a reviewer key a scanned sheet from the PDF without calling unread fields blank", async () => {
    m.extraction = { setMeta: null, sheets: [], scanned: true, extractFailed: false };
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1", revision: "1" }];
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByRole("button", { name: "Add sheet manually" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Manual sheet number" }), { target: { value: "S-101" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Manual sheet title" }), { target: { value: "FOUNDATION PLAN" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Manual revision" }), { target: { value: "REV 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reviewed sheet" }));
    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getAllByText(/human/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not inspected — unknown/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PDF page 1/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    expect(await screen.findByText("Keyed sheet: S-101")).toBeTruthy();
  });

  it("rejects a manually keyed source page beyond the actual PDF length", async () => {
    m.extraction = { setMeta: null, sheets: [], scanned: true, extractFailed: false };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByRole("button", { name: "Add sheet manually" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Manual sheet number" }), { target: { value: "S-101" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Source PDF page" }), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reviewed sheet" }));
    expect(screen.getByText(/PDF has only 1 page/i)).toBeTruthy();
    expect(screen.queryByText("S-101")).toBeNull();
  });

  it("keeps the chosen PDF available for manual review when extraction fails", async () => {
    m.extraction = { extractFailed: true, error: "AI extraction failed" };
    renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    expect(screen.getByText("revision.pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add sheet manually" })).toBeTruthy();
  });

  it("discards an unfinished shop review when the active project changes", async () => {
    const view = render(<DocumentControl />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /Shop drawing or revision/i }));
    await dropPdf();
    m.projectId = "p2";
    view.rerender(<DocumentControl />);
    expect(screen.queryByText("revision.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: /Shop drawing or revision/i })).toBeTruthy();
  });

  it("shows an interrupted review's attestations without silently applying them to a reselected PDF", async () => {
    const view = renderShopControl();
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    fireEvent.click(screen.getAllByRole("button", { name: /I see it/i })[0]);
    view.unmount();

    render(<DocumentControl />, { wrapper });
    expect(screen.getByText(/Unfinished review: revision.pdf/)).toBeTruthy();
    expect(screen.getByText(/S-101.*seal marked present/)).toBeTruthy();
    expect(screen.getByText(/reselect the PDF and reconfirm the marks/)).toBeTruthy();
    expect(screen.queryByText("revision.pdf")).toBeNull();
  });

  it("does not claim no drawings were saved after an interrupted revision wizard", async () => {
    m.drawings = [{ ...m.drawings[0], drawing_set_id: "set1", drawing_set_name: "SHOP A" }];
    m.sets = [{ id: "set1", set_name: "SHOP A", project_id: "p1" }];
    const view = renderShopControl();
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    fireEvent.click(screen.getByRole("button", { name: "Start revision upload" }));
    expect(await screen.findByRole("region", { name: "Revision upload wizard" })).toBeTruthy();
    view.unmount();
    render(<DocumentControl />, { wrapper });
    expect(screen.getByText(/revision upload was started but not confirmed complete/i)).toBeTruthy();
  });
});
