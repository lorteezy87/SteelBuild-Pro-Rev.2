// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GcIssuanceFormModal from "../GcIssuanceFormModal";

const extractor = vi.hoisted(() => ({
  result: {
    setMeta: { issuedBy: "Architect" },
    sheets: [{ sheetNumber: "S-101", sheetTitle: "Foundation", revision: "2", pdfPage: 2 }],
    scanned: false,
    extractFailed: false,
    pageCount: 3,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(async () => extractor.result),
}));
vi.mock("@/lib/docControl/pdfPageCount", () => ({
  readPdfPageCount: vi.fn(async () => 3),
}));

describe("GC issuance PDF intake", () => {
  beforeEach(() => {
    extractor.result = {
      setMeta: { issuedBy: "Architect" },
      sheets: [{ sheetNumber: "S-101", sheetTitle: "Foundation", revision: "2", pdfPage: 2 }],
      scanned: false,
      extractFailed: false,
      pageCount: 3,
    };
  });

  it("requires an explicit source choice and reviewed page mapping before save", async () => {
    const onSave = vi.fn(async (_values: Record<string, unknown>, _intake?: { file: File | null; sheets: Array<Record<string, unknown>> }) => {});
    render(<GcIssuanceFormModal open onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GC structural reissue" } });
    fireEvent.click(screen.getByRole("button", { name: "PDF source" }));
    fireEvent.change(screen.getByLabelText("GC source PDF"), {
      target: { files: [new File(["%PDF-1.4"], "gc-revision.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(screen.getByLabelText("GC sheet number 1")).toHaveValue("S-101"));
    expect(screen.getByRole("link", { name: /source page 2/i })).toHaveAttribute("href", expect.stringContaining("#page=2"));
    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I checked each listed sheet and source PDF page/i));
    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I reviewed the remaining PDF pages/i));
    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      metadata: { intake_source: "reviewed_gc_pdf", source_page_count: 3, mapped_sheet_count: 1 },
    });
    expect(onSave.mock.calls[0][1]).toMatchObject({
      file: expect.objectContaining({ name: "gc-revision.pdf" }),
      sheets: [expect.objectContaining({ drawing_number: "S-101", pdf_page: 2, revision: "2" })],
    });
  });

  it("lets a scanned PDF be keyed manually against a verified page", async () => {
    extractor.result = { setMeta: null, sheets: [], scanned: true, extractFailed: false, pageCount: 3 };
    const onSave = vi.fn(async (_values: Record<string, unknown>, _intake?: { file: File | null; sheets: Array<Record<string, unknown>> }) => {});
    render(<GcIssuanceFormModal open onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Scanned GC bulletin" } });
    fireEvent.click(screen.getByRole("button", { name: "PDF source" }));
    fireEvent.change(screen.getByLabelText("GC source PDF"), {
      target: { files: [new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(screen.getByText("Manual page mapping is required for unreadable or scanned pages.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add sheet from page" }));
    fireEvent.change(screen.getByLabelText("GC sheet number 1"), { target: { value: "A-301" } });
    fireEvent.change(screen.getByLabelText("Source page 1"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText(/I checked each listed sheet and source PDF page/i));
    fireEvent.click(screen.getByLabelText(/I reviewed the remaining PDF pages/i));
    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1]).toMatchObject({
      sheets: [expect.objectContaining({ drawing_number: "A-301", pdf_page: 3 })],
    });
  });

  it("holds a partial record for inspection instead of creating it twice", async () => {
    const onSave = vi.fn(async () => {
      throw Object.assign(new Error("sheet write failed"), { setId: "gc-set-1", uploadedPath: "org/uploads/gc.pdf" });
    });
    render(<GcIssuanceFormModal open onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GC reissue" } });
    fireEvent.click(screen.getByRole("button", { name: "PDF source" }));
    fireEvent.change(screen.getByLabelText("GC source PDF"), {
      target: { files: [new File(["%PDF-1.4"], "gc.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(screen.getByLabelText("GC sheet number 1")).toHaveValue("S-101"));
    fireEvent.click(screen.getByLabelText(/I checked each listed sheet and source PDF page/i));
    fireEvent.click(screen.getByLabelText(/I reviewed the remaining PDF pages/i));
    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    await waitFor(() => expect(screen.getByText(/Partial issuance gc-set-1 exists/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /log issuance/i })).toBeDisabled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
