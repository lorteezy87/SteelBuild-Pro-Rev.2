import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Loads every drawing for the current project, applies an optional
// case-insensitive search filter (matches sheet_number OR title), and
// resolves the active drawing + its index within the filtered list.
//
// Pulled out of DrawingViewer so the page component only deals with the
// derived shape it needs. Behaviour is byte-identical to the inline
// useQuery + filter logic that previously lived in the page.
//
// Returns:
//   - drawings     — full unfiltered list for this project (used by callout
//                    cross-sheet lookup, ContextPanel, and the filmstrip).
//   - filtered     — search-filtered list (drives the sidebar + nav arrows).
//   - activeDrawing
//   - activeIndex  — index of the active drawing within `filtered`, or -1.
export function useDrawingsList({ projectId, activeId, search }) {
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  const filtered = search.trim()
    ? drawings.filter((d) =>
        d.sheet_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.title?.toLowerCase().includes(search.toLowerCase())
      )
    : drawings;

  const activeDrawing = drawings.find((d) => d.id === activeId);
  const activeIndex = filtered.findIndex((d) => d.id === activeId);

  return { drawings, filtered, activeDrawing, activeIndex };
}
