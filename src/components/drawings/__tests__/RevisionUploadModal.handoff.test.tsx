// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attestFromHuman } from "@/lib/docControl";
import type { ComponentType } from "react";
import type { RevisionUploadHandoffProps } from "../revisionUploadHandoff";

const m = vi.hoisted(() => ({
  createDrawing: vi.fn(async (_record: Record<string, unknown>) => ({ id: "new-drawing" })),
  updateSet: vi.fn(async (_id: string, _patch: Record<string, unknown>) => ({})),
  ensureCurrentRevision: vi.fn(async () => null),
  upload: vi.fn(async (_request: { file: File }) => ({ file_url: "https://example.test/revision.pdf" })),
  extract: vi.fn(async () => []),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Drawing: { filterAll: vi.fn(async () => []), create: m.createDrawing, update: vi.fn(async () => ({})) },
    DrawingSet: { update: m.updateSet },
    DrawingRevision: { update: vi.fn(async () => ({})) },
  },
  integrations: { Core: { UploadFile: m.upload } },
}));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn(async () => {}) }));
vi.mock("@/lib/drawingHub", () => ({ ensureCurrentRevision: m.ensureCurrentRevision, recordSheetSlipSheet: vi.fn(async () => null) }));
vi.mock("@/lib/AuthContext", async () => {
  const React = await import("react");
  return { AuthContext: React.createContext({ user: { full_name: "N. Lortie" } }) };
});
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../revisionUploadSteps/SelectSetStep", () => ({ default: (): null => null }));
vi.mock("../revisionUploadSteps/RevMetaStep", () => ({ default: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>Next metadata</button> }));
vi.mock("../revisionUploadSteps/DropPdfStep", () => ({ default: ({ onExtract, setFile }: { onExtract: () => void; setFile: (file: File) => void }) => <>
  <button onClick={onExtract}>Extract PDF</button>
  <button onClick={() => setFile(new File(["different"], "other.pdf", { type: "application/pdf" }))}>Choose different PDF</button>
</> }));
vi.mock("../revisionUploadSteps/SheetComparisonStep", () => ({ default: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>Apply revision</button> }));
vi.mock("../revisionUploadSteps/ProcessingStep", () => ({ default: () => <span>Processing</span> }));
vi.mock("../revisionUploadSteps/SuccessStep", () => ({ default: () => <span>Saved revision</span> }));
vi.mock("../revisionUploadHelpers", async (importOriginal) => {
  const original = await importOriginal<typeof import("../revisionUploadHelpers")>();
  return { ...original, extractRevisionSheets: m.extract };
});

import RevisionUploadModal from "../RevisionUploadModal";
import { entities } from "@/api/supabaseClient";
const ReviewedRevisionModal = RevisionUploadModal as unknown as ComponentType<RevisionUploadHandoffProps>;

const preflightFile = new File(["%PDF-1.4"], "revision.pdf", { type: "application/pdf" });
const reviewedSheet = { sheetNumber: "S-101", sheetTitle: "FRAMING PLAN", revision: "IFC", pdfPage: 1 };

function openReviewedRevision(initialAttestations = {}, setRevision = "1") {
  const onComplete = vi.fn((_result: { complete?: boolean; failed?: number; historyFailed?: number; setWriteFailed?: boolean }): void => {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReviewedRevisionModal
        open
        onClose={() => {}}
        onComplete={onComplete}
        activeProject={{ id: "p1", name: "Desert Ridge Phase 2" }}
        preSelectedSet={{ id: "set1", set_name: "SHOP A", revision: setRevision, revision_history: "[]" }}
        drawingSets={[]}
        initialPdfFile={preflightFile}
        initialAttestations={initialAttestations}
        initialReview={{ sheets: [reviewedSheet], scanned: false, setMeta: null, sourcePages: { "S-101": 1 }, revisionLabel: "IFC", issueDate: "2026-04-02", issuedBy: "" }}
      />
    </QueryClientProvider>,
  );
  return onComplete;
}

async function reachComparison() {
  fireEvent.click(screen.getByRole("button", { name: "Next metadata" }));
  fireEvent.click(screen.getByRole("button", { name: "Extract PDF" }));
  await screen.findByRole("button", { name: "Apply revision" });
}

describe("reviewed revision handoff", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reuses the reviewed PDF extraction and does not infer IFC status from its label", async () => {
    openReviewedRevision();
    await reachComparison();
    expect(m.extract).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    await waitFor(() => expect(m.createDrawing).toHaveBeenCalledTimes(1));
    expect(m.createDrawing.mock.calls[0][0]).not.toHaveProperty("ifc_status");
  });

  it("stops database writes when a reviewed sheet has a human-confirmed missing seal", async () => {
    openReviewedRevision({ "S-101": { stamp: attestFromHuman("absent", "N. Lortie") } });
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/held sheet/)).toBeTruthy();
    expect(m.updateSet).not.toHaveBeenCalled();
    expect(m.createDrawing).not.toHaveBeenCalled();
  });

  it("reports a partial save instead of full completion when a sheet write fails", async () => {
    m.createDrawing.mockRejectedValueOnce(new Error("database write failed"));
    const onComplete = openReviewedRevision();
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toMatchObject({ complete: false, failed: 1 });
    expect(m.updateSet).not.toHaveBeenCalled();
    expect(screen.queryByText("Revision Applied")).toBeNull();
    expect(screen.getByText(/partial revision upload/i)).toBeTruthy();
  });

  it("keeps the set header at its prior revision when sheet history fails", async () => {
    m.ensureCurrentRevision.mockRejectedValueOnce(new Error("revision history unavailable"));
    const onComplete = openReviewedRevision();
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toMatchObject({ complete: false, historyFailed: 1 });
    expect(m.createDrawing).toHaveBeenCalledTimes(1);
    expect(m.updateSet).not.toHaveBeenCalled();
  });

  it("reports a set header failure after sheet writes without inviting an in-place retry", async () => {
    m.updateSet.mockRejectedValueOnce(new Error("set header unavailable"));
    const onComplete = openReviewedRevision();
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(m.createDrawing).toHaveBeenCalledTimes(1);
    expect(m.ensureCurrentRevision).toHaveBeenCalledTimes(1);
    expect(m.updateSet).toHaveBeenCalledTimes(1);
    expect(m.createDrawing.mock.invocationCallOrder[0]).toBeLessThan(m.updateSet.mock.invocationCallOrder[0]);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ complete: false, failed: 0, historyFailed: 0, setWriteFailed: true });
    expect(screen.getAllByText(/set header could not be updated/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Apply revision" })).toBeNull();
  });

  it("counts untouched live sheets in a partial re-issue set header", async () => {
    const untouchedSheet = { id: "old-102", project_id: "p1", drawing_set_id: "set1", sheet_number: "S-102", title: "SECOND FLOOR", revision_number: "1", stage: "OFA", is_superseded: false } as unknown as Awaited<ReturnType<typeof entities.Drawing.filterAll>>[number];
    vi.mocked(entities.Drawing.filterAll).mockImplementation(async (filter) =>
      filter && ("drawing_set_id" in filter || "drawing_set_name" in filter) ? [untouchedSheet] : []
    );
    const onComplete = openReviewedRevision();
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toMatchObject({ complete: true });
    expect(m.updateSet.mock.calls[0][1]).toMatchObject({ sheet_count: 2 });
  });

  it("blocks a second upload of a revision already recorded on the set", async () => {
    openReviewedRevision({}, "IFC");
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/already records revision IFC/i)).toBeTruthy();
    expect(m.createDrawing).not.toHaveBeenCalled();
    expect(m.updateSet).not.toHaveBeenCalled();
  });

  it("keeps reviewed metadata tied to the exact PDF selected in Document Control", async () => {
    openReviewedRevision();
    fireEvent.click(screen.getByRole("button", { name: "Next metadata" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose different PDF" }));
    expect(screen.getByText(/return to Document Control/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Extract PDF" }));
    await screen.findByRole("button", { name: "Apply revision" });
    expect(m.upload.mock.calls[0][0]).toMatchObject({ file: preflightFile });
    expect(m.extract).not.toHaveBeenCalled();
  });

  it("stops before set writes when the live sheet roster cannot be refreshed", async () => {
    openReviewedRevision();
    await reachComparison();
    vi.mocked(entities.Drawing.filterAll).mockRejectedValueOnce(new Error("register unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/could not refresh live set sheets/i)).toBeTruthy();
    expect(m.updateSet).not.toHaveBeenCalled();
    expect(m.createDrawing).not.toHaveBeenCalled();
  });
});
