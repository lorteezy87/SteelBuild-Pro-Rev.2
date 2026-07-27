export const drawingViewerStyles = `
.drawing-viewer-redesign {
  --viewer-sidebar-width: 320px;
  --viewer-context-width: 336px;
  --viewer-panel-bg: color-mix(in srgb, var(--bg-surface) 96%, #111827 4%);
  --viewer-panel-bg-soft: color-mix(in srgb, var(--bg-surface-low) 92%, #0f172a 8%);
  --viewer-line: color-mix(in srgb, var(--border-default) 82%, transparent);
  --viewer-paper-shadow: 0 22px 70px rgba(0,0,0,0.52), 0 4px 14px rgba(0,0,0,0.34);
  position: relative;
  display: flex;
  flex-direction: row;
  flex: 1;
  height: calc(100dvh - 36px);
  max-height: calc(100dvh - 36px);
  min-height: 0;
  overflow: hidden;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 8% 0%, rgba(37, 99, 235, 0.12), transparent 26rem),
    radial-gradient(circle at 92% 8%, rgba(16, 185, 129, 0.10), transparent 24rem),
    var(--bg-page);
}

/*
 * Layout shell uses .sb-dashboard-reference-page { flex-direction: column }.
 * That class is also on the viewer root for chrome padding reset — but the
 * viewer MUST stay a ROW (sidebar | canvas | context). Without this override
 * the main pane collapses to height:0 and the empty-state/PDF canvas vanish.
 * Specificity: two classes beats .sb-dashboard-reference-page alone.
 */
.sb-dashboard-reference-page.drawing-viewer-redesign {
  flex-direction: row;
  gap: 0;
  padding: 0;
  min-height: 0;
  height: calc(100dvh - 36px);
  max-height: calc(100dvh - 36px);
  overflow: hidden;
}

.drawing-viewer-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawing-viewer-pane {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #111827;
}

.drawing-viewer-toolbar {
  min-height: 54px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  overflow-x: auto;
  border-bottom: 1px solid var(--viewer-line);
  background: var(--viewer-panel-bg);
}

.drawing-viewer-canvas-scroll {
  flex: 1 !important;
  overflow: auto !important;
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  cursor: default;
  background:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    radial-gradient(circle at 50% 8%, rgba(37,99,235,0.14), transparent 30rem),
    linear-gradient(180deg, #182235 0%, #101827 48%, #0b1120 100%) !important;
  background-size: 28px 28px, 28px 28px, auto, auto;
}

.drawing-viewer-canvas-scroll.is-panning {
  cursor: grab !important;
}

.drawing-viewer-paper-wrap {
  position: relative;
  padding: 40px;
  min-width: min-content;
}

.drawing-viewer-paper-wrap canvas {
  box-shadow: var(--viewer-paper-shadow);
  border: 1px solid rgba(255,255,255,0.16);
  background: #fff;
}

.drawing-viewer-empty-state {
  margin: auto;
  max-width: 460px;
  padding: 28px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 18px 48px rgba(0,0,0,0.28);
}

.drawing-viewer-empty-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  color: rgba(255,255,255,0.42);
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 800;
}

.drawing-viewer-empty-title {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.82);
}

.drawing-viewer-empty-copy {
  margin: 8px 0 0;
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(255,255,255,0.56);
}

.drawing-viewer-bottom-hints {
  min-height: 34px;
  padding: 7px 16px;
  border-top: 1px solid var(--viewer-line);
  background: var(--viewer-panel-bg);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.drawing-viewer-hint {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
}

.drawing-viewer-hint strong {
  color: var(--text-primary);
  font-weight: 800;
}

.drawing-viewer-export-markups {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid rgba(200,155,32,0.62);
  border-radius: 6px;
  background: rgba(24, 20, 12, 0.92);
  color: var(--accent);
  box-shadow: 0 10px 24px rgba(0,0,0,0.38);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}

.drawing-sheet-sidebar,
.drawing-context-panel {
  background: var(--viewer-panel-bg);
  backdrop-filter: none;
}

.drawing-sheet-card:hover,
.drawing-context-link:hover,
.drawing-toolbar-button:hover,
.drawing-header-crumb:hover {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--border-default));
}

@media (max-width: 1180px) {
  .drawing-viewer-redesign {
    --viewer-sidebar-width: 292px;
    --viewer-context-width: 306px;
  }

  .drawing-viewer-paper-wrap {
    padding: 28px;
  }
}

@media (max-width: 920px) {
  .drawing-viewer-redesign {
    --viewer-sidebar-width: min(88vw, 340px);
    --viewer-context-width: min(88vw, 340px);
  }

  .drawing-sheet-sidebar.is-open {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 42;
    box-shadow: 18px 0 44px rgba(0,0,0,0.38);
  }

  .drawing-context-panel {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 43;
    box-shadow: -18px 0 44px rgba(0,0,0,0.38);
  }

  .drawing-viewer-bottom-hints {
    display: none;
  }

  .drawing-viewer-header-command {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .drawing-viewer-header-status {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 720px) {
  .drawing-viewer-redesign {
    height: calc(100dvh - 52px);
    max-height: calc(100dvh - 52px);
  }

  .drawing-viewer-breadcrumb-row {
    overflow-x: auto !important;
    padding: 8px 12px !important;
  }

  .drawing-viewer-breadcrumb-row .drawing-header-crumb {
    flex: 0 0 auto;
    max-width: 170px;
  }

  .drawing-viewer-header-stages {
    grid-template-columns: repeat(7, minmax(86px, 1fr)) !important;
  }

  .drawing-viewer-toolbar {
    padding: 7px 10px;
  }

  .drawing-viewer-paper-wrap {
    padding: 18px;
  }

  .drawing-viewer-empty-state {
    margin: 18px;
  }
}

/* ===========================================================================
   canonical light presentation (SP5) — SURROUNDING CHROME ONLY.
   ---------------------------------------------------------------------------
   The DrawingViewer is a standalone route (not inside the Detailing command
   shell), so DrawingViewer.jsx flips [data-skin="command"] on <html> + tags
   the root .detailing-cc for the canonical presentation. That makes the
   shipped [data-skin="command"] .detailing-cc token-alias block resolve every
   var(--bg-surface / --text-* / --border-default / --accent / ...) the header,
   toolbar, sidebar, and hints consume to the light kit palette.

   The one thing the alias can't reach is the three --viewer-* custom props
   defined above: they color-mix the (now-light) surface vars back with dark
   literals (#111827 / #0f172a), muddying the chrome. Re-declare them to clean
   light values here — every chrome surface that references them (toolbar,
   sidebar header/footer, count badges, mini-metrics, sheet cards, meta blocks,
   bottom hints) re-lights in one move. Only the floating fixed "Export Markups"
   button hardcodes its own dark, so it gets an explicit override.

   OUT OF SCOPE (stays dark by design — the drawing work-surface):
   .drawing-viewer-pane, .drawing-viewer-canvas-scroll, .drawing-viewer-paper-
   wrap, the in-canvas empty-state cards, and the floating markup/zone overlay
   toolbars that sit ON the dark canvas (deferred to SP5-2).

   This whole block is scoped to .drawing-viewer-redesign.detailing-cc, a class
   combination that is ONLY present when the flag is on — so flag-off is
   byte-identical and nothing here touches src/styles/command.css.

   NOTE on the generic [data-skin="command"] [class$="-cc"] rule in command.css:
   it turns any *-cc element into a column flex "light island" (flex-direction:
   column; gap:14px; padding:16px; min-height:100%). That is right for the hub's
   panel wrappers, but the viewer root is a full-height ROW layout (sidebar |
   main | context). Because we reuse .detailing-cc on the root to inherit the
   token alias, that generic rule would clobber the row layout. The selectors
   below are prefixed [data-skin="command"] (specificity 0,3,0 > the generic's
   0,2,0) so they deterministically win and restore the viewer's own layout.
   =========================================================================== */
/*
 * Command-skin light chrome (optional). Row layout is already forced above via
 * .sb-dashboard-reference-page.drawing-viewer-redesign — do not gate the ROW
 * restore on [data-skin="command"] (DrawingViewer no longer sets that attr).
 */
[data-skin="command"] .drawing-viewer-redesign.detailing-cc {
  display: flex;
  flex-direction: row;
  gap: 0;
  padding: 0;
  min-height: 0;
  height: calc(100dvh - 36px);
  background:
    radial-gradient(circle at 8% 0%, rgba(37, 99, 235, 0.06), transparent 26rem),
    radial-gradient(circle at 92% 8%, rgba(16, 185, 129, 0.05), transparent 24rem),
    var(--bg-page);
  /* Re-light the viewer chrome vars (they color-mix the surface vars back with
     dark literals above — override to clean light so the chrome isn't muddy). */
  --viewer-panel-bg: var(--bg-surface);
  --viewer-panel-bg-soft: var(--bg-surface-low);
  --viewer-line: var(--border-default);
  --viewer-paper-shadow: 0 22px 70px rgba(15,23,42,0.22), 0 4px 14px rgba(15,23,42,0.14);
}

@media (max-width: 720px) {
  [data-skin="command"] .drawing-viewer-redesign.detailing-cc {
    height: calc(100dvh - 52px);
  }
}

[data-skin="command"] .drawing-viewer-redesign.detailing-cc .drawing-viewer-export-markups {
  background: var(--accent-muted, #fdf3da);
  border-color: var(--accent-border, #f0d79a);
  color: var(--accent);
  box-shadow: 0 10px 24px rgba(15,23,42,0.16);
}
`;
