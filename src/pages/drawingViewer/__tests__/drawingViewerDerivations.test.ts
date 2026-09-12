import { describe, expect, it } from "vitest";
import {
  deriveOverlayViewModel,
  deriveSidebarViewModel,
  deriveToolbarViewModel,
  deriveZonePanelSheet,
  pickViewerRecordId,
  resolveRevisionDeepLinkAction,
  type ViewerDrawing,
} from "../drawingViewerDerivations";

const drawing = (patch: Partial<ViewerDrawing> = {}): ViewerDrawing => ({
  id: "drawing-1",
  project_id: "project-1",
  is_deleted: false,
  ...patch,
} as ViewerDrawing);

describe("drawing viewer route derivations", () => {
  it("preserves deep-link id priority", () => {
    expect(pickViewerRecordId(new URLSearchParams(
      "docId=doc&drawingId=drawing&id=id&recordId=record",
    ))).toBe("record");
    expect(pickViewerRecordId(new URLSearchParams("drawingId=drawing"))).toBe("drawing");
    expect(pickViewerRecordId(new URLSearchParams())).toBeNull();
  });

  it("derives toolbar and sidebar summaries without changing stage semantics", () => {
    const drawings = [
      drawing({ file_url: "a.pdf", priority_flag: true, stage: "Released" }),
      drawing({ id: "drawing-2", file_url: null, priority_flag: false, stage: "Released" }),
    ];

    expect(deriveToolbarViewModel(drawings[0], 3)).toMatchObject({
      hasPdf: true,
      canPage: true,
      stage: expect.objectContaining({ label: "RELEASED" }),
    });
    expect(deriveSidebarViewModel(drawings, 1)).toMatchObject({
      attachedCount: 1,
      priorityCount: 1,
      totalCount: 2,
      visibleCount: 1,
      stageCounts: expect.objectContaining({ Released: 2 }),
    });
  });

  it("scopes markup and zone chrome to the rendered canvas page", () => {
    expect(deriveOverlayViewModel({
      activeDrawing: drawing({ file_url: "a.pdf" }),
      renderMode: "canvas",
      pdfError: null,
      markupItems: [
        { kind: "note", pdf_page: 2 },
        { kind: "rect", pdf_page: 2 },
        { kind: "note", pdf_page: 1 },
      ],
      currentPage: 2,
      zoneMode: "view",
      zoneCount: 3,
      filteredZoneCount: 2,
      computedZoneCount: 3,
    })).toEqual({
      hasCanvas: true,
      currentPageMarkupCount: 2,
      hasCurrentPageNotes: true,
      showZoneFilter: true,
      visibleZoneCount: 2,
      totalZoneCount: 3,
    });
  });

  it("keeps revision selection on the requested project sheet before clearing the URL", () => {
    expect(resolveRevisionDeepLinkAction({
      requestedRevisionId: "revision-1",
      requestedRevisionFetched: true,
      drawingsLoading: false,
      requestedDrawingId: "drawing-2",
      activeId: "drawing-1",
      drawingIds: ["drawing-1", "drawing-2"],
    })).toEqual({ type: "switch", drawingId: "drawing-2" });

    expect(resolveRevisionDeepLinkAction({
      requestedRevisionId: "revision-1",
      requestedRevisionFetched: true,
      drawingsLoading: false,
      requestedDrawingId: "outside-project",
      activeId: "drawing-1",
      drawingIds: ["drawing-1"],
    })).toEqual({ type: "unavailable" });
  });

  it("prefers revision metadata for the zone panel and falls back to the sheet", () => {
    expect(deriveZonePanelSheet({
      id: "revision-1",
      drawing_id: "drawing-1",
      revision_code: "B",
      sheet_number: "S-101",
      sheet_title: "Framing Plan",
    }, drawing())).toEqual({
      sheet_number: "S-101",
      sheet_title: "Framing Plan",
      revision_code: "B",
    });
    expect(deriveZonePanelSheet(null, drawing({
      sheet_number: null,
      drawing_number: "A-1",
      title: "Plan",
    }))).toEqual({
      sheet_number: "A-1",
      sheet_title: "Plan",
    });
  });
});
