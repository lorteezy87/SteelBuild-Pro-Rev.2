// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Compare rasterizes real PDFs through pdfjs. None of that is under test here —
// what is, is which pairs the modal offers and what it says when it can offer
// none — so stub the rasterizer rather than feeding it fixture PDFs.
vi.mock("@/lib/pdfRasterize", () => ({
  RASTER_TARGET_WIDTH: 1800,
  rasterizePage: vi.fn((): Promise<never> => new Promise<never>(() => {})),
  canvasToPngBase64: (): string | null => null,
}));

import GcCompareModal from "../GcCompareModal";
import type { GcChainSet, GcChainSheet } from "@/lib/gcDocuments/gcRevisionChain";

const sets: GcChainSet[] = [
  { id: "set-base", set_name: "Construction Set - Structural", doc_number: "003", issued_date: "2026-07-07" },
  { id: "set-asi", set_name: "ASI 012", doc_number: "ASI 012", issued_date: "2026-09-01" },
];

function sheet(over: Partial<GcChainSheet> & { id: string }): GcChainSheet {
  return {
    project_id: "p1",
    gc_drawing_set_id: "set-base",
    drawing_number: "SE305",
    title: "Roof framing",
    revision: "1",
    file_url: "projects/p1/base.pdf",
    pdf_page: 4,
    ...over,
  };
}

function renderModal(active: GcChainSheet | null, sheets: GcChainSheet[]) {
  return render(
    <GcCompareModal
      open
      onClose={vi.fn()}
      active={active}
      sheets={sheets}
      sets={sets}
    />,
  );
}

describe("GcCompareModal", () => {
  it("offers both issuances, newest preselected as NEW", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi", revision: "2" });

    renderModal(base, [base, reissue]);

    const newer = screen.getByLabelText("Newer issuance") as HTMLSelectElement;
    const older = screen.getByLabelText("Older issuance") as HTMLSelectElement;
    expect(newer.value).toBe("b");
    expect(older.value).toBe("a");
    expect(within(newer).getByRole("option", { name: /ASI 012/ })).toBeInTheDocument();
  });

  // Each of these is a different fact about the job. A single "nothing to
  // compare" would read as a broken feature rather than as the state of the
  // register, which is what it actually is.
  it("says only one version has been received, rather than failing silently", () => {
    const only = sheet({ id: "a" });

    renderModal(only, [only]);

    expect(screen.getByText("Only one version of this sheet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Newer issuance")).toBeNull();
  });

  it("distinguishes a missing PDF on the other version", () => {
    const base = sheet({ id: "a" });
    const noFile = sheet({ id: "b", gc_drawing_set_id: "set-asi", file_url: null });

    renderModal(base, [base, noFile]);

    expect(screen.getByText("The other version has no PDF")).toBeInTheDocument();
  });

  it("distinguishes the open sheet itself having no PDF", () => {
    const base = sheet({ id: "a", file_url: null });
    const other = sheet({ id: "b", gc_drawing_set_id: "set-asi" });

    renderModal(base, [base, other]);

    expect(screen.getByText("No file attached")).toBeInTheDocument();
  });

  it("handles no sheet selected at all", () => {
    renderModal(null, []);
    expect(screen.getByText("No document open")).toBeInTheDocument();
  });

  it("starts in overlay mode and shows the red/blue legend", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi" });

    renderModal(base, [base, reissue]);

    expect(screen.getByRole("button", { name: /Overlay/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/only in OLD \(removed\)/)).toBeInTheDocument();
    expect(screen.getByText(/only in NEW \(added\)/)).toBeInTheDocument();
  });

  // The overlay finds moved ink, not changed intent. A PM must not read a clean
  // overlay as "nothing changed structurally".
  it("states that the overlay is a pixel diff, not a reading of the drawings", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi" });

    renderModal(base, [base, reissue]);

    expect(screen.getByText(/read the\s+changes off the drawings themselves/i)).toBeInTheDocument();
  });

  // The AI revision-impact rail writes rows FK'd to drawings.id /
  // drawing_revisions.id. A gc_drawings id satisfies neither, so the control
  // must be absent here — not present and broken.
  it("offers no AI diff control", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi" });

    renderModal(base, [base, reissue]);

    expect(screen.queryByText(/AI Diff/i)).toBeNull();
  });

  it("renders no <form> element (CLAUDE.md)", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi" });

    const { container } = renderModal(base, [base, reissue]);

    expect(container.querySelector("form")).toBeNull();
  });
});
