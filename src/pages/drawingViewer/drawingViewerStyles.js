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

.drawing-viewer-main {
  flex: 1;
  min-width: 0;
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
`;
