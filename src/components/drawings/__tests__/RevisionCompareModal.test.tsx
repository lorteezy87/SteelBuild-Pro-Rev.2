// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRasterCompare = vi.hoisted(() => vi.fn());
const recordVisualRevisionReview = vi.hoisted(() => vi.fn());
const generateRevisionDiff = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "r2", is_current: true, revision_code: "2", file_url: "new.pdf", pdf_page: 1 },
      { id: "r1", is_current: false, revision_code: "1", file_url: "old.pdf", pdf_page: 1 },
    ],
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
  DialogContent: ({ children }: { children: unknown }) => children,
  DialogHeader: ({ children }: { children: unknown }) => children,
  DialogTitle: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/api/supabaseClient", () => ({ entities: { DrawingRevision: { filter: vi.fn() } } }));
vi.mock("@/hooks/useRasterCompare", () => ({ useRasterCompare }));
vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => true }));
vi.mock("@/components/shared/useAppSecurity", () => ({ useAppSecurity: () => ({ user: { id: "u1" } }) }));
vi.mock("@/components/drawings/RevisionDeltaCard", () => ({ default: (): null => null }));
vi.mock("@/components/rfis/RFIFormModal", () => ({ default: (): null => null }));
vi.mock("@/lib/pdfRasterize", () => ({ RASTER_TARGET_WIDTH: 1200, canvasToPngBase64: vi.fn(() => "image") }));
vi.mock("@/lib/rasterCompare", () => ({ OLD_TINT: "#f00", NEW_TINT: "#00f" }));
vi.mock("@/lib/drawingHub", () => ({ ensureCurrentRevision: vi.fn() }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/rfiFromDelta", () => ({ buildRfiPrefillFromDelta: vi.fn(), createRfiAndLink: vi.fn() }));
vi.mock("@/lib/revisionSnapshotDiff", () => ({
  generateRevisionDiff,
  recordVisualRevisionReview,
  setDeltaDismissed: vi.fn(),
  sortDeltasBySeverity: (deltas: unknown[]) => deltas,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RevisionCompareModal from "../RevisionCompareModal";

const drawing = {
  id: "d1",
  project_id: "p1",
  sheet_number: "S2.1",
  title: "FRAMING PLAN",
  revision_number: "2",
  file_url: "new.pdf",
  pdf_page: 1,
};

function rasterState(overrides: Record<string, unknown> = {}) {
  return {
    mode: "overlay",
    setMode: vi.fn(),
    wipePct: 50,
    setWipePct: vi.fn(),
    offset: { x: 0, y: 0 },
    nudge: vi.fn(),
    resetOffset: vi.fn(),
    zoom: 1,
    zoomBy: vi.fn(),
    rendering: false,
    renderError: "",
    rastersReady: true,
    retryRender: vi.fn(),
    displayRef: { current: null as HTMLCanvasElement | null },
    sideOldRef: { current: null as HTMLCanvasElement | null },
    sideNewRef: { current: null as HTMLCanvasElement | null },
    rastersRef: { current: { old: {}, new: {} } },
    ...overrides,
  };
}

function renderModal() {
  return render(<RevisionCompareModal open onClose={vi.fn()} drawing={drawing} />);
}

describe("RevisionCompareModal", () => {
  beforeEach(() => {
    useRasterCompare.mockReset();
    recordVisualRevisionReview.mockReset();
    generateRevisionDiff.mockReset();
    invalidateQueries.mockReset().mockResolvedValue(undefined);
  });

  it("keeps AI and visual completion disabled on a render failure and provides retry", async () => {
    const state = rasterState({ rastersReady: false, renderError: "network", retryRender: vi.fn() });
    useRasterCompare.mockReturnValue(state);

    renderModal();

    expect(await screen.findByRole("button", { name: "AI Diff" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark visual review complete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry rendering" }));
    expect(state.retryRender).toHaveBeenCalledOnce();
  });

  it("records a human visual review only after the raster pair is ready", async () => {
    useRasterCompare.mockReturnValue(rasterState());
    recordVisualRevisionReview.mockResolvedValue({ id: "c1", compare_status: "complete" });

    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Mark visual review complete" }));
    await waitFor(() => expect(recordVisualRevisionReview).toHaveBeenCalledWith({
      drawingId: "d1",
      fromRevisionId: "r1",
      toRevisionId: "r2",
    }));
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-revision-comparisons", "p1"] }));
  });

  it("presents a cached visual attestation without claiming AI found no changes", async () => {
    useRasterCompare.mockReturnValue(rasterState());
    generateRevisionDiff.mockResolvedValue({
      comparison: { model: "visual-review", ai_summary: "Human visual comparison completed." },
      deltas: [], cached: true,
    });
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "AI Diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate diff" }));
    expect(await screen.findByText("HUMAN REVIEW")).toBeInTheDocument();
    expect(screen.getByText(/does not establish that the revisions are unchanged/)).toBeInTheDocument();
    expect(screen.queryByText(/No material changes detected/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-revision-comparisons", "p1"] });
  });

  it("keeps a pending AI review from competing with visual completion or pair changes", async () => {
    useRasterCompare.mockReturnValue(rasterState());
    let finish!: (value: unknown) => void;
    generateRevisionDiff.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "AI Diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate diff" }));
    await waitFor(() => expect(generateRevisionDiff).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Mark visual review complete" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Old revision" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "New revision" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Swap old/new" })).toBeDisabled();
    await act(async () => finish({ comparison: { model: "ai", ai_summary: "A connection changed." }, deltas: [{}] }));
    expect(screen.getByText("A connection changed.")).toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-revision-comparisons", "p1"] });
  });

  it("does not label a newly selected sheet complete when an older visual save finishes", async () => {
    useRasterCompare.mockReturnValue(rasterState());
    let finish!: (value: unknown) => void;
    recordVisualRevisionReview.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "AI Diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark visual review complete" }));
    await waitFor(() => expect(recordVisualRevisionReview).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Generate diff" })).toBeDisabled();
    view.rerender(<RevisionCompareModal open onClose={vi.fn()} drawing={{ ...drawing, id: "d2", project_id: "p2" }} />);
    await act(async () => finish({ compare_status: "complete", model: "visual-review" }));
    expect(screen.queryByRole("button", { name: "Visual review complete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark visual review complete" })).toBeEnabled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-revision-comparisons", "p1"] });
  });
});
