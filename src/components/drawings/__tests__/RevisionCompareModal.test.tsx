// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRasterCompare = vi.hoisted(() => vi.fn());
const recordVisualRevisionReview = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "r2", is_current: true, revision_code: "2", file_url: "new.pdf", pdf_page: 1 },
      { id: "r1", is_current: false, revision_code: "1", file_url: "old.pdf", pdf_page: 1 },
    ],
    isLoading: false,
  }),
  useQueryClient: () => ({}),
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
vi.mock("@/components/drawings/RevisionDeltaCard", () => ({ default: () => null }));
vi.mock("@/components/rfis/RFIFormModal", () => ({ default: () => null }));
vi.mock("@/lib/pdfRasterize", () => ({ RASTER_TARGET_WIDTH: 1200, canvasToPngBase64: vi.fn(() => "image") }));
vi.mock("@/lib/rasterCompare", () => ({ OLD_TINT: "#f00", NEW_TINT: "#00f" }));
vi.mock("@/lib/drawingHub", () => ({ ensureCurrentRevision: vi.fn() }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/rfiFromDelta", () => ({ buildRfiPrefillFromDelta: vi.fn(), createRfiAndLink: vi.fn() }));
vi.mock("@/lib/revisionSnapshotDiff", () => ({
  generateRevisionDiff: vi.fn(),
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
    displayRef: { current: null },
    sideOldRef: { current: null },
    sideNewRef: { current: null },
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
  });
});
