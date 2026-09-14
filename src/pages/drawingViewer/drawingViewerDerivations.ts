import type { RowWithAliases } from "@/api/supabaseClient";
import { STAGE_MAP, STAGE_ORDER } from "@/components/drawings/drawingsConfig";

export type ViewerDrawing = RowWithAliases<"drawings"> & {
  drawing_number?: string | null;
  file_name?: string | null;
};

export type ViewerRevision = Pick<
  RowWithAliases<"drawing_revisions">,
  "id" | "drawing_id" | "revision_code" | "sheet_number" | "sheet_title"
>;

export interface ViewerMarkup {
  kind?: string | null;
  pdf_page?: number | null;
}

export function pickViewerRecordId(searchParams: URLSearchParams | null): string | null {
  if (!searchParams) return null;
  return (
    searchParams.get("recordId") ||
    searchParams.get("id") ||
    searchParams.get("drawingId") ||
    searchParams.get("docId") ||
    null
  );
}

export function deriveToolbarViewModel(
  activeDrawing: ViewerDrawing | null | undefined,
  totalPages: number,
) {
  return {
    stage: activeDrawing?.stage ? STAGE_MAP[activeDrawing.stage] : undefined,
    hasPdf: Boolean(activeDrawing?.file_url),
    canPage: totalPages > 1,
  };
}

export function deriveSidebarViewModel(
  drawings: ViewerDrawing[],
  visibleCount: number,
) {
  const stageCounts = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
  let attachedCount = 0;
  let priorityCount = 0;

  for (const drawing of drawings) {
    if (drawing.file_url) attachedCount += 1;
    if (drawing.priority_flag) priorityCount += 1;
    if (drawing.stage && drawing.stage in stageCounts) {
      stageCounts[drawing.stage] += 1;
    }
  }

  return {
    attachedCount,
    priorityCount,
    stageCounts,
    totalCount: drawings.length,
    visibleCount,
  };
}

interface OverlayViewModelInput {
  activeDrawing: ViewerDrawing | null | undefined;
  renderMode: string;
  pdfError: string | null | undefined;
  markupItems: ViewerMarkup[];
  currentPage: number;
  zoneMode: string;
  zoneCount: number;
  filteredZoneCount: number;
  computedZoneCount: number;
}

export function deriveOverlayViewModel(input: OverlayViewModelInput) {
  const hasCanvas = Boolean(
    input.activeDrawing?.file_url &&
    input.renderMode === "canvas" &&
    !input.pdfError,
  );
  const currentPageMarkups = input.markupItems.filter(
    (markup) => (markup.pdf_page || 1) === input.currentPage,
  );

  return {
    hasCanvas,
    currentPageMarkupCount: currentPageMarkups.length,
    hasCurrentPageNotes: currentPageMarkups.some((markup) => markup.kind === "note"),
    showZoneFilter: hasCanvas && input.zoneMode !== "off" && input.zoneCount > 0,
    visibleZoneCount: input.filteredZoneCount,
    totalZoneCount: input.computedZoneCount,
  };
}

export function deriveZonePanelSheet(
  currentRevision: ViewerRevision | null | undefined,
  activeDrawing: ViewerDrawing | null | undefined,
) {
  if (currentRevision) {
    return {
      sheet_number: currentRevision.sheet_number,
      sheet_title: currentRevision.sheet_title,
      revision_code: currentRevision.revision_code,
    };
  }
  if (!activeDrawing) return null;
  return {
    sheet_number: activeDrawing.sheet_number || activeDrawing.drawing_number,
    sheet_title: activeDrawing.title,
  };
}

type RevisionDeepLinkAction =
  | { type: "wait" }
  | { type: "switch"; drawingId: string }
  | { type: "unavailable" }
  | { type: "clear" };

interface RevisionDeepLinkInput {
  requestedRevisionId: string | null;
  requestedRevisionFetched: boolean;
  drawingsLoading: boolean;
  requestedDrawingId: string | null | undefined;
  activeId: string | null;
  drawingIds: string[];
}

export function resolveRevisionDeepLinkAction(
  input: RevisionDeepLinkInput,
): RevisionDeepLinkAction {
  if (
    !input.requestedRevisionId ||
    !input.requestedRevisionFetched ||
    input.drawingsLoading
  ) {
    return { type: "wait" };
  }

  if (input.requestedDrawingId && input.requestedDrawingId !== input.activeId) {
    return input.drawingIds.includes(input.requestedDrawingId)
      ? { type: "switch", drawingId: input.requestedDrawingId }
      : { type: "unavailable" };
  }

  return input.requestedDrawingId ? { type: "clear" } : { type: "unavailable" };
}
