import { useEffect } from "react";

// Window-level keyboard shortcuts for the viewer page. Lifted out of
// DrawingViewer.jsx but the binding logic is byte-identical:
//
//   ← / ↓        prev sheet (within filtered list)
//   → / ↑        next sheet
//   = / +        zoom in (clamped 4.0)
//   -            zoom out (clamped 0.25)
//   0            reset zoom to 1.0
//   PageDown / j next PDF page
//   PageUp   / k prev PDF page
//   [ / ]        toggle sidebar
//   F            toggle filmstrip
//   I            toggle context panel
//   R / Shift+R  rotate CW / CCW
//   ?            toggle shortcuts overlay (without ctrl/meta/alt)
//   V P B H A M K T  switch markup tool (select / pen / rect / highlight /
//                   arrow / measure / calibrate / note)
//   Esc          snap markup tool back to "select"
//
// The handler skips when the focused element is an <input> so the search
// box etc. aren't hijacked.
export function useViewerKeyboardShortcuts({
  filtered,
  activeIndex,
  totalPages,
  setActiveId,
  setZoom,
  setCurrentPage,
  setSidebarOpen,
  setFilmstripOpen,
  setContextOpen,
  setRotation,
  setShortcutsOpen,
  setActiveTool,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[activeIndex + 1];
        if (next) setActiveId(next.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = filtered[activeIndex - 1];
        if (prev) setActiveId(prev.id);
      } else if (e.key === "=" || e.key === "+") {
        setZoom((z) => Math.min(4.0, +(z + 0.25).toFixed(2)));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)));
      } else if (e.key === "0") {
        setZoom(1.0);
      } else if (e.key === "PageDown" || e.key === "j") {
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === "PageUp" || e.key === "k") {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === "[" || e.key === "]") {
        setSidebarOpen((o) => !o);
      } else if (e.key === "f" || e.key === "F") {
        setFilmstripOpen((o) => !o);
      } else if (e.key === "i" || e.key === "I") {
        setContextOpen((o) => !o);
      } else if (e.key === "r" || e.key === "R") {
        // r = rotate CW; Shift+R = rotate CCW
        setRotation((rot) => (e.shiftKey ? (rot + 270) % 360 : (rot + 90) % 360));
      } else if (e.key === "?") {
        // `?` — Shift+/ on US keyboards. Only intercept when no modifiers
        // other than Shift are held so Ctrl+?/browser find still works.
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setShortcutsOpen((o) => !o);
        }
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "p" || e.key === "P") {
        setActiveTool("pen");
      } else if (e.key === "b" || e.key === "B") {
        setActiveTool("rect");
      } else if (e.key === "h" || e.key === "H") {
        // H = highlight. Lowercase only — uppercase H on some layouts
        // collides with browser "Open history" (not a thing by default
        // but some extensions bind it); lowercase is safe.
        setActiveTool("highlight");
      } else if (e.key === "a" || e.key === "A") {
        setActiveTool("arrow");
      } else if (e.key === "m" || e.key === "M") {
        setActiveTool("measure");
      } else if (e.key === "k" || e.key === "K") {
        setActiveTool("calibrate");
      } else if (e.key === "t" || e.key === "T") {
        setActiveTool("note");
      } else if (e.key === "Escape") {
        // Esc snaps back to select so keyboard users can bail on a tool
        // without hunting for the toolbar.
        setActiveTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    filtered, activeIndex, totalPages,
    setActiveId, setZoom, setCurrentPage,
    setSidebarOpen, setFilmstripOpen, setContextOpen,
    setRotation, setShortcutsOpen, setActiveTool,
  ]);
}
