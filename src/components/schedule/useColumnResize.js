// ── useColumnResize — Gantt left-panel column widths ─────────────────────
//
// Owns the user-adjustable column widths for the Gantt's task table: the width
// array (persisted to localStorage), the derived CSS grid template + left-panel
// width, and the drag-to-resize / double-click-to-reset handlers. Extracted from
// ScheduleGantt so the container isn't carrying this self-contained pointer +
// persistence logic inline. Behaviour is byte-identical to the originals.
import { useState, useMemo } from "react";
import {
  loadColWidths, DEFAULT_COL_WIDTHS, MIN_COL_WIDTH, MIN_NAME_WIDTH, COL_WIDTHS_KEY,
} from "./scheduleGanttHelpers";

export function useColumnResize() {
  // Widths live in state; dragging a header divider mutates the index
  // for that column. 0 means "flex" (1fr) — used by TASK NAME so it
  // auto-fills leftover space. Persisted to localStorage per-user.
  const [colWidths, setColWidths] = useState(loadColWidths);
  const GRID = useMemo(
    () => colWidths.map(w => (w === 0 ? `minmax(${MIN_NAME_WIDTH}px, 1fr)` : `${w}px`)).join(" "),
    [colWidths]
  );
  // Left-panel width auto-grows with the fixed columns so TASK NAME never
  // collapses below MIN_NAME_WIDTH. Flex (0-width) entries contribute the
  // min — the column itself gets more via 1fr if there's extra space.
  const LEFT_W = useMemo(
    () => colWidths.reduce((sum, w) => sum + (w === 0 ? MIN_NAME_WIDTH : w), 0) + 24 /* inner padding */,
    [colWidths]
  );
  // Drag handler factory for a given column index. We capture the
  // pointer at mousedown, track deltaX, clamp, and persist on mouseup.
  const startColResize = (colIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colIndex];
    // For the flex column we pin a concrete starting width so dragging
    // it feels natural (otherwise going from 1fr → Npx mid-drag jumps).
    const effectiveStart = startW === 0 ? MIN_NAME_WIDTH : startW;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (mv) => {
      const delta = mv.clientX - startX;
      const next = Math.max(MIN_COL_WIDTH, Math.min(400, effectiveStart + delta));
      setColWidths(prev => {
        const out = [...prev];
        out[colIndex] = next;
        return out;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      setColWidths(curr => {
        try { window.localStorage?.setItem(COL_WIDTHS_KEY, JSON.stringify(curr)); } catch {}
        return curr;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const resetColWidths = () => {
    setColWidths(DEFAULT_COL_WIDTHS);
    try { window.localStorage?.removeItem(COL_WIDTHS_KEY); } catch {}
  };
  // Double-click a single divider → reset just that column to its default.
  const resetColumn = (colIndex) => {
    setColWidths(prev => {
      const out = [...prev];
      out[colIndex] = DEFAULT_COL_WIDTHS[colIndex];
      try { window.localStorage?.setItem(COL_WIDTHS_KEY, JSON.stringify(out)); } catch {}
      return out;
    });
  };

  return { colWidths, GRID, LEFT_W, startColResize, resetColWidths, resetColumn };
}
