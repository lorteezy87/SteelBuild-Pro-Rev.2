import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { entities } from "@/api/supabaseClient";

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
  const { data: rawDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId ? entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 30000,
  });

  // ── Fix duplicate pdf_page values ──────────────────────────────────
  // Multi-sheet PDFs share one file_url; each sheet should point to a
  // unique page via pdf_page. A known LLM extraction bug can assign the
  // same pdf_page to multiple sheets in the same file, causing every
  // thumbnail (and the main viewer) to show the same page. We detect
  // collisions per file_url and reassign duplicates to the nearest
  // unused page so both the filmstrip and the canvas render correctly
  // even when the stored data is bad.
  const drawings = useMemo(() => fixDuplicatePdfPages(rawDrawings), [rawDrawings]);

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

/**
 * Detect and fix duplicate pdf_page values among sheets sharing the same
 * file_url. Returns a new array (or the same reference if no fixes needed).
 */
function fixDuplicatePdfPages(drawings) {
  if (!drawings || drawings.length === 0) return drawings;

  // Group by file_url — only multi-sheet groups can have collisions.
  const byFile = new Map();
  for (let i = 0; i < drawings.length; i++) {
    const key = drawings[i].file_url || drawings[i].id; // single-file sheets key by id
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(i);
  }

  let anyFixed = false;
  // Work on a shallow copy only if we find a problem.
  let result = null;

  for (const [, indices] of byFile) {
    if (indices.length <= 1) continue;

    // Check for duplicate pdf_page values in this group.
    const pageCounts = {};
    for (const idx of indices) {
      const pg = drawings[idx].pdf_page || 1;
      pageCounts[pg] = (pageCounts[pg] || 0) + 1;
    }
    const hasDupes = Object.values(pageCounts).some((c) => c > 1);
    if (!hasDupes) continue;

    // Lazy-copy the array on first fix.
    if (!result) result = [...drawings];
    anyFixed = true;

    // Build the set of all available pages for this file.
    const maxPage = Math.max(
      ...indices.map((idx) => drawings[idx].pdf_page || 1),
      indices.length,
    );
    const allPages = new Set();
    for (let p = 1; p <= maxPage; p++) allPages.add(p);

    // First-come-first-served: first sheet claiming a page keeps it,
    // subsequent duplicates get reassigned to the nearest unclaimed page.
    const claimed = new Set();
    for (const idx of indices) {
      const pg = drawings[idx].pdf_page || 1;
      if (!claimed.has(pg)) {
        claimed.add(pg);
        allPages.delete(pg);
      } else {
        // Find nearest unclaimed page.
        let best = null;
        for (const p of allPages) {
          if (best === null || Math.abs(p - pg) < Math.abs(best - pg)) {
            best = p;
          }
        }
        if (best !== null) {
          result[idx] = { ...result[idx], pdf_page: best };
          claimed.add(best);
          allPages.delete(best);
        } else {
          // All pages claimed — assign beyond the max.
          const fallback = maxPage + claimed.size + 1;
          result[idx] = { ...result[idx], pdf_page: fallback };
          claimed.add(fallback);
        }
      }
    }
  }

  return anyFixed ? result : drawings;
}
