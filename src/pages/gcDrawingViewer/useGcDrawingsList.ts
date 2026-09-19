import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { fixDuplicatePdfPages } from "@/pages/drawingViewer/useDrawingsList";

/**
 * The GC viewer's list. Deliberately the GC twin of `useDrawingsList` rather
 * than a second source bolted onto it: GC documents are read-only here, so
 * none of the markup, zone or stage machinery that hook feeds is wanted.
 *
 * Two differences from the shop-drawing side, both from the table shape:
 *   - the sheet identifier is `drawing_number`, not `sheet_number`
 *   - the revision is free text (`revision`), because a GC issuance carries
 *     the GC's own revision string, not our stage ladder
 *
 * `fixDuplicatePdfPages` is shared, not copied. A GC set is uploaded as one
 * PDF split into N rows keyed by pdf_page, exactly like a shop drawing set, so
 * the same bad-extraction collision can make every sheet render page 1.
 */
/** Narrow read contract: only what the viewer actually touches. Deliberately
 * not the full generated row type, and named apart from gcDocumentsPageDerive's
 * `GcDrawingRow` so two different shapes never share one name. */
export interface GcViewerDrawing {
  id: string;
  project_id?: string | null;
  gc_drawing_set_id?: string | null;
  drawing_number?: string | null;
  title?: string | null;
  revision?: string | null;
  discipline?: string | null;
  file_url?: string | null;
  pdf_page?: number | null;
  is_superseded?: boolean | null;
  superseded_by_id?: string | null;
}

export interface UseGcDrawingsListArgs {
  projectId: string | null;
  activeId: string | null;
  search: string;
}

export interface UseGcDrawingsListResult {
  drawings: GcViewerDrawing[];
  filtered: GcViewerDrawing[];
  activeDrawing: GcViewerDrawing | undefined;
  activeIndex: number;
  isLoading: boolean;
}

/** Natural order so "ASI-10" follows "ASI-9" rather than "ASI-1". */
const drawingNumberCmp = (a: GcViewerDrawing, b: GcViewerDrawing) =>
  String(a.drawing_number || "").localeCompare(
    String(b.drawing_number || ""),
    undefined,
    { numeric: true, sensitivity: "base" },
  );

export function useGcDrawingsList({
  projectId,
  activeId,
  search,
}: UseGcDrawingsListArgs): UseGcDrawingsListResult {
  const { data: rawDrawings = [], isLoading } = useQuery({
    queryKey: ["gc-drawings", "viewer", projectId],
    queryFn: () =>
      projectId
        ? (entities.GcDrawing.filter({ project_id: projectId }) as Promise<GcViewerDrawing[]>)
        : Promise.resolve([] as GcViewerDrawing[]),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const drawings = useMemo(() => {
    const deduped = fixDuplicatePdfPages(rawDrawings) as GcViewerDrawing[];
    // sort() is stable, so rows sharing a number keep their incoming order
    // instead of shuffling between renders.
    return [...deduped].sort(drawingNumberCmp);
  }, [rawDrawings]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return drawings;
    return drawings.filter(
      (d) =>
        d.drawing_number?.toLowerCase().includes(needle) ||
        d.title?.toLowerCase().includes(needle),
    );
  }, [drawings, search]);

  return {
    drawings,
    filtered,
    activeDrawing: drawings.find((d) => d.id === activeId),
    activeIndex: filtered.findIndex((d) => d.id === activeId),
    isLoading,
  };
}
