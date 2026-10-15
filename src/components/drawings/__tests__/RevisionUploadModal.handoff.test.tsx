// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
  slip: vi.fn(),
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
vi.mock("@/lib/drawingHub", () => ({ ensureCurrentRevision: m.ensureCurrentRevision, recordSheetSlipSheet: m.slip }));
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
vi.mock("../revisionUploadSteps/SheetComparisonStep", () => ({ default: ({ onConfirm, setSupersedeUnlisted }: { onConfirm: () => void; setSupersedeUnlisted: (value: boolean) => void }) => <>
  <button onClick={() => setSupersedeUnlisted(true)}>Retire missing sheets</button>
  <button onClick={onConfirm}>Apply revision</button>
</> }));
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

function openReviewedRevision(initialAttestations = {}, setRevision = "1", pdfPage: number | null = 1) {
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
        initialReview={{ sheets: [{ ...reviewedSheet, pdfPage }], pageCount: 1, scanned: false, setMeta: null, sourcePages: { "S-101": 1 }, revisionLabel: "IFC", issueDate: "2026-04-02", issuedBy: "" }}
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

describe("reviewed revision handoff containment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entities.Drawing.filterAll).mockResolvedValue([]);
  });
  function expectNoWrites() {
    expect(m.createDrawing).not.toHaveBeenCalled();
    expect(entities.Drawing.update).not.toHaveBeenCalled();
    expect(entities.DrawingRevision.update).not.toHaveBeenCalled();
    expect(m.ensureCurrentRevision).not.toHaveBeenCalled();
    expect(m.slip).not.toHaveBeenCalled();
    expect(m.updateSet).not.toHaveBeenCalled();
  }
  it.each(["added", "revised", "removed"])("holds %s application before any split mutation", async action => {
    const roster = action === "added" ? [] : [
      { id: "old-101", project_id: "p1", drawing_set_id: "set1", sheet_number: "S-101", revision_number: "1", file_url: "app-files/original.pdf", pdf_page: 2 },
      ...(action === "removed" ? [{ id: "old-102", project_id: "p1", drawing_set_id: "set1", sheet_number: "S-102", revision_number: "1" }] : []),
    ];
    vi.mocked(entities.Drawing.filterAll).mockResolvedValue(roster as never);
    const onComplete = openReviewedRevision();
    await reachComparison();
    if (action === "removed") fireEvent.click(screen.getByRole("button", { name: "Retire missing sheets" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/transactional revision service/i)).toBeTruthy();
    expectNoWrites();
    expect(onComplete).not.toHaveBeenCalled();
  });
  it.each([null, 0, 2])("refuses unresolved or out-of-range page %s before any writes", async page => {
    openReviewedRevision({}, "1", page);
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/confirmed.*PDF page/i)).toBeTruthy();
    expectNoWrites();
  });
  it("reuses the exact reviewed PDF extraction without another model call", async () => {
    openReviewedRevision();
    await reachComparison();
    expect(m.extract).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it("holds a human-confirmed missing seal before application", async () => {
    openReviewedRevision({ "S-101": { stamp: attestFromHuman("absent", "N. Lortie") } });
    await reachComparison();
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));
    expect(await screen.findByText(/held sheet/)).toBeTruthy();
    expectNoWrites();
  });
  it("keeps reviewed metadata tied to the exact PDF from Document Control", async () => {
    openReviewedRevision();
    fireEvent.click(screen.getByRole("button", { name: "Next metadata" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose different PDF" }));
    expect(screen.getByText(/return to Document Control/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Extract PDF" }));
    await screen.findByRole("button", { name: "Apply revision" });
    expect(m.upload.mock.calls[0][0]).toMatchObject({ file: preflightFile });
    expect(m.extract).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
