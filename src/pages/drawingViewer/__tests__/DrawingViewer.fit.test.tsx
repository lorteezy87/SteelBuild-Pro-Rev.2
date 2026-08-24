// @vitest-environment jsdom

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canvasRef: { current: HTMLCanvasElement | null } = { current: null };
const invalidateQueries = vi.fn();
const setPdfError = vi.fn();
const getPage = vi.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({
    width: 2_000 * scale,
    height: 1_000 * scale,
  }),
}));
const pdfDoc = { numPages: 1, getPage };

let viewportWidth = 1_200;
let viewportHeight = 700;
let resizeCallback: ResizeObserverCallback | null = null;

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: () => ({ data: null as unknown, isFetched: true }),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: { Drawing: { update: vi.fn() } },
  resolveFileUrl: vi.fn(async () => "https://example.test/drawing.pdf"),
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "project-1", name: "Test Project" } }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null as unknown } })) },
    from: vi.fn(),
  },
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("@/components/drawings/viewer/ViewerHeader", () => ({ default: () => <div>Viewer header</div> }));
vi.mock("@/components/drawings/viewer/AnnotationToolbar", () => ({
  default: (): null => null,
  MARKUP_COLORS: [{ value: "#ff0000" }],
}));
vi.mock("@/components/drawings/viewer/ShortcutsOverlay", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/RenderSkeleton", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ThumbnailFilmstrip", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ContextPanel", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/AnnotationLayer", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ZoneLayer", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ZonePanel", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ZoneFilterBar", () => ({ default: (): null => null }));
vi.mock("@/components/drawings/viewer/ProposalPanel", () => ({ default: (): null => null }));
vi.mock("@/pages/drawingViewer/ZonesFloatingToolbar", () => ({ default: (): null => null }));
vi.mock("@/pages/drawingViewer/CalloutOverlay", () => ({ default: (): null => null }));
vi.mock("@/pages/drawingViewer/PdfLinkHotspotLayer", () => ({ default: (): null => null }));

vi.mock("@/components/drawings/viewer/useMarkup", () => ({
  useMarkup: () => ({
    items: [] as unknown[],
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    saving: false,
    saveError: null as unknown,
  }),
}));

vi.mock("@/pages/drawingViewer/useAutoScaleOnLoad", () => ({
  useAutoScaleOnLoad: () => ({ handleAutoDetectScale: vi.fn() }),
}));

vi.mock("@/pages/drawingViewer/useSpacebarPan", () => ({
  useSpacebarPan: () => ({ spacePan: false, spacebarPanRef: { current: false } }),
}));

vi.mock("@/pages/drawingViewer/useDrawingsList", () => ({
  useDrawingsList: () => {
    const drawing = {
      id: "drawing-1",
      project_id: "project-1",
      sheet_number: "A1.01",
      title: "Anchor Bolt Plan",
      stage: "released",
      file_url: "drawings/a101.pdf",
    };
    return {
      drawings: [drawing],
      filtered: [drawing],
      activeDrawing: drawing,
      activeIndex: 0,
      isLoading: false,
    };
  },
}));

vi.mock("@/pages/drawingViewer/usePdfLoader", () => ({
  usePdfLoader: () => ({
    resolvedUrl: "https://example.test/drawing.pdf",
    pdfDoc,
    totalPages: 1,
    pdfError: null as string | null,
    currentPage: 1,
    setCurrentPage: vi.fn(),
    setPdfError,
  }),
}));

vi.mock("@/pages/drawingViewer/usePdfRenderer", () => ({
  usePdfRenderer: () => ({
    canvasRef,
    rendering: false,
    currentViewport: null as unknown,
    canvasSize: { width: 0, height: 0 },
    pageSize: { width: 2_000, height: 1_000 },
    linkHotspots: [] as unknown[],
  }),
}));

vi.mock("@/pages/drawingViewer/useViewerKeyboardShortcuts", () => ({
  useViewerKeyboardShortcuts: (): void => undefined,
}));

vi.mock("@/pages/drawingViewer/useZoneData", () => ({
  useZoneData: () => ({
    currentRevision: null as unknown,
    zones: [] as unknown[],
    refetchZones: vi.fn(async () => undefined),
    pendingProposalCount: 0,
    dependencyEdges: [] as unknown[],
    zoneSummaries: new Map<string, unknown>(),
    zoneDensities: new Map<string, unknown>(),
    zonesWithComputed: [] as unknown[],
    zoneStatusCounts: {} as Record<string, number>,
    filteredZones: [] as unknown[],
  }),
}));

vi.mock("@/hooks/useAutoOpenEdit", () => ({ useAutoOpenEdit: (): void => undefined }));
vi.mock("@/services/auditLogger", () => ({ logActivity: vi.fn() }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/drawingHub", () => ({
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
  createNewRevisionAndCarryZones: vi.fn(),
  unlockSet: vi.fn(),
}));

import DrawingViewer from "../../DrawingViewer";

class TestResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={["/DrawingViewer?recordId=drawing-1"]}>
      <DrawingViewer />
    </MemoryRouter>,
  );
}

describe("DrawingViewer responsive fit", () => {
  beforeEach(() => {
    viewportWidth = 1_200;
    viewportHeight = 700;
    resizeCallback = null;
    canvasRef.current = null;
    getPage.mockClear();
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function () {
      return this.classList?.contains("drawing-viewer-canvas-scroll") ? viewportWidth : 2_500;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function () {
      return this.classList?.contains("drawing-viewer-canvas-scroll") ? viewportHeight : 1_600;
    });
  });

  it("starts with the Sheet Navigator collapsed", () => {
    const { container } = renderViewer();

    const sheetNavigator = container.querySelector(".drawing-sheet-sidebar");
    expect(sheetNavigator).toHaveClass("is-closed");
    expect(sheetNavigator).toHaveStyle({ width: "0px" });
  });

  it("defaults to fitting the entire sheet against the real canvas viewport", async () => {
    renderViewer();

    await waitFor(() => {
      expect(screen.getByTitle("Zoom preset")).toHaveTextContent("55%");
    });
  });

  it("refits the sheet when side-panel changes resize the canvas viewport", async () => {
    renderViewer();
    await waitFor(() => expect(screen.getByTitle("Zoom preset")).toHaveTextContent("55%"));

    viewportWidth = 900;
    act(() => resizeCallback?.([], {} as ResizeObserver));

    await waitFor(() => {
      expect(screen.getByTitle("Zoom preset")).toHaveTextContent("40%");
    });
  });

  it("still allows an intentional manual zoom after the automatic fit", async () => {
    const user = userEvent.setup();
    renderViewer();
    await waitFor(() => expect(screen.getByTitle("Zoom preset")).toHaveTextContent("55%"));

    await user.click(screen.getByTitle("Zoom in"));

    expect(screen.getByTitle("Zoom preset")).toHaveTextContent("65%");
  });
});
