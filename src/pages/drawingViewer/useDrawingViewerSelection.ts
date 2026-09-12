import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useDrawingsList } from "@/pages/drawingViewer/useDrawingsList";
import {
  pickViewerRecordId,
  resolveRevisionDeepLinkAction,
  type ViewerDrawing,
} from "@/pages/drawingViewer/drawingViewerDerivations";

interface DrawingListResult {
  drawings: ViewerDrawing[];
  filtered: ViewerDrawing[];
  activeDrawing: ViewerDrawing | undefined;
  activeIndex: number;
  isLoading: boolean;
}

export function useDrawingViewerSelection(projectId: string | null | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(
    pickViewerRecordId(searchParams),
  );
  const [search, setSearch] = useState("");
  const requestedRevisionId = searchParams.get("revisionId");

  const drawingList = useDrawingsList({
    projectId,
    activeId,
    search,
  }) as DrawingListResult;
  const { drawings, activeDrawing, isLoading: drawingsLoading } = drawingList;

  useAutoOpenEdit(drawings, (drawing: ViewerDrawing) => setActiveId(drawing.id), {
    enabled: !drawingsLoading,
    param: "recordId",
  });

  const { data: requestedRevision, isFetched: requestedRevisionFetched } = useQuery({
    queryKey: ["drawing-revision-deep-link", requestedRevisionId],
    queryFn: async () => {
      if (!requestedRevisionId) return null;
      const { data, error } = await supabase
        .from("drawing_revisions")
        .select("id,drawing_id")
        .eq("id", requestedRevisionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(requestedRevisionId),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const action = resolveRevisionDeepLinkAction({
      requestedRevisionId,
      requestedRevisionFetched,
      drawingsLoading,
      requestedDrawingId: requestedRevision?.drawing_id,
      activeId,
      drawingIds: drawings.map((drawing) => drawing.id),
    });
    if (action.type === "wait") return;
    if (action.type === "switch") {
      setActiveId(action.drawingId);
      return;
    }
    if (action.type === "unavailable") {
      toast.error("The requested drawing revision is unavailable for this project.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("revisionId");
    setSearchParams(next, { replace: true });
  }, [
    activeId,
    drawings,
    drawingsLoading,
    requestedRevision?.drawing_id,
    requestedRevisionFetched,
    requestedRevisionId,
    searchParams,
    setSearchParams,
  ]);

  return {
    ...drawingList,
    activeId,
    setActiveId,
    search,
    setSearch,
  };
}
