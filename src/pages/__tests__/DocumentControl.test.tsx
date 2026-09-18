// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  drawings: [] as Array<Record<string, unknown>>,
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
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: { Drawing: { filter: vi.fn(async () => m.drawings) } },
}));

vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "p1" }));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { full_name: "N. Lortie", email: "n@example.com" } }),
}));

vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(async () => m.extraction),
}));

vi.mock("@/lib/pdfPageText", () => ({
  readPdfPageTexts: vi.fn(async () => m.pageTexts),
}));

import DocumentControl from "../DocumentControl";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
    m.drawings = [
      {
        id: "d1",
        sheet_number: "S-101",
        title: "FOUNDATION PLAN",
        revision_number: "1",
        is_superseded: false,
      },
    ];
    m.pageTexts = {};
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
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against 1 live sheet/)).toBeTruthy());
  });

  it("places a dropped sheet against the project register, not a single set", async () => {
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();

    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getByText(/Matches live register sheet S-101 at revision 1/)).toBeTruthy();
  });

  it("excludes superseded rows from the register it checks against", async () => {
    m.drawings = [{ id: "d1", sheet_number: "S-101", is_superseded: true }];
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against 0 live sheets/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    // Shown as the register verdict and again as the matching finding.
    expect(screen.getAllByText(/is not in the live register/).length).toBe(2);
  });

  it("warns that a capped register read cannot call a sheet new", async () => {
    m.drawings = Array.from({ length: 1000 }, (_, i) => ({
      id: `d${i}`,
      sheet_number: `X-${i}`,
      is_superseded: false,
    }));
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against 1,?000 live sheets|Checked against 1000 live sheets/)).toBeTruthy());
    await dropPdf();
    expect(screen.getByText(/register read was capped/i)).toBeTruthy();
    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getAllByText(/truncated by the row cap/i).length).toBe(2);
  });

  it("flags an image-only PDF instead of reporting blank title blocks", async () => {
    m.extraction = { ...m.extraction, scanned: true };
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    // On the summary chip, and again in the seal / signature bases.
    expect(screen.getAllByText(/image-only/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/nothing could be read from the text layer/i)).toBeTruthy();
  });

  it("detects a seal from that page's harvested text", async () => {
    m.pageTexts = { 1: "REGISTERED PROFESSIONAL ENGINEER LICENSE NO. 45821" };
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());
    await dropPdf();
    fireEvent.click(screen.getByText("S-101"));
    expect(screen.getByText(/Seal text found in the page text layer/)).toBeTruthy();
  });

  it("surfaces an extraction failure rather than an empty result", async () => {
    m.extraction = { extractFailed: true, error: "AI extraction failed" };
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());

    const zone = screen.getByLabelText(/Drop a drawing PDF/i);
    const file = new File(["%PDF-1.4"], "bad.pdf", { type: "application/pdf" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText("AI extraction failed")).toBeTruthy());
  });

  it("refuses a file that is not a PDF", async () => {
    render(<DocumentControl />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Checked against/)).toBeTruthy());

    const zone = screen.getByLabelText(/Drop a drawing PDF/i);
    const file = new File(["x"], "schedule.xlsx", { type: "application/vnd.ms-excel" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/That is not a PDF/)).toBeTruthy());
  });
});
