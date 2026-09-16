import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ViewerHeader from "@/components/drawings/viewer/ViewerHeader";
import ShortcutsOverlay from "@/components/drawings/viewer/ShortcutsOverlay";
import RenderSkeleton from "@/components/drawings/viewer/RenderSkeleton";
import ThumbnailFilmstrip from "@/components/drawings/viewer/ThumbnailFilmstrip";
import ContextPanel from "@/components/drawings/viewer/ContextPanel";
import AnnotationLayer from "@/components/drawings/viewer/AnnotationLayer";
import AnnotationToolbar from "@/components/drawings/viewer/AnnotationToolbar";
import { useMarkup } from "@/components/drawings/viewer/useMarkup";
import { extractStoragePathFromSignedUrl } from "@/components/drawings/viewer/storageUrl";
import { resolveFileUrl } from "@/api/supabaseClient";
import ZoneLayer from "@/components/drawings/viewer/ZoneLayer";
import ZonePanel from "@/components/drawings/viewer/ZonePanel";
import ZoneFilterBar from "@/components/drawings/viewer/ZoneFilterBar";
import ProposalPanel from "@/components/drawings/viewer/ProposalPanel";
import { mono } from "@/pages/drawingViewer/drawingViewerUtils";
import { useSpacebarPan } from "@/pages/drawingViewer/useSpacebarPan";
import { useViewerKeyboardShortcuts } from "@/pages/drawingViewer/useViewerKeyboardShortcuts";
import SheetListSidebar from "@/pages/drawingViewer/SheetListSidebar";
import ZonesFloatingToolbar from "@/pages/drawingViewer/ZonesFloatingToolbar";
import ViewerToolbar from "@/pages/drawingViewer/ViewerToolbar";
import CalloutOverlay from "@/pages/drawingViewer/CalloutOverlay";
import PdfLinkHotspotLayer from "@/pages/drawingViewer/PdfLinkHotspotLayer";
import { drawingViewerStyles } from "@/pages/drawingViewer/drawingViewerStyles";
import { useDrawingViewerController } from "@/pages/drawingViewer/useDrawingViewerController";

import ExportMarkupPDFModal from "@/components/drawings/ExportMarkupPDFModal";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDF_PAGE_BACKGROUND = "#fff";

export default function DrawingViewer() {
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const controller = useDrawingViewerController(projectId);
  const {
    userId,
    sidebarOpen, setSidebarOpen,
    shortcutsOpen, setShortcutsOpen,
    filmstripOpen, setFilmstripOpen,
    contextOpen, setContextOpen,
    zoom, setZoom,
    rotation, setRotation,
    renderMode, setRenderMode,
    activeTool, setActiveTool,
    activeColor, setActiveColor,
    activeStamp, setActiveStamp,
    hideResolved, setHideResolved,
    exportMarkupOpen, setExportMarkupOpen,
    zoneMode, setZoneMode,
    drawShape, setDrawShape,
    zoneOverlay, setZoneOverlay,
    selectedZoneId, setSelectedZoneId,
    panelZoneId, setPanelZoneId,
    zoneFilter, setZoneFilter,
    proposalPanelOpen, setProposalPanelOpen,
    hoveredProposal, setHoveredProposal,
    showDeps, setShowDeps,
    drawings,
    filtered,
    activeDrawing,
    activeIndex,
    activeId,
    setActiveId,
    search,
    setSearch,
    markupScale,
    resolvedUrl,
    pdfDoc,
    totalPages,
    pdfError,
    currentPage,
    setCurrentPage,
    setPdfError,
    canvasRef,
    rendering,
    currentViewport,
    canvasSize,
    pageSize,
    linkHotspots,
    currentRevision,
    zones,
    refetchZones,
    pendingProposalCount,
    dependencyEdges,
    zoneSummaries,
    zoneDensities,
    zonesWithComputed,
    zoneStatusCounts,
    filteredZones,
    markup,
    overlayView,
    zonePanelSheet,
    handleCalibrate,
    handleNewRevision,
    handleZoneDrawComplete,
    handleZoneUpdate,
    handleZoneDelete,
    onCalloutClick,
    handleAnnotationClick,
    handleFitWidth,
    handleFitPage,
    handleZoomPreset,
    handleCanvasWheel,
    handleDownload,
    activeDrawingSet,
    handleAutoDetectScale,
    handleUnlock,
  } = controller;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 920px)").matches) return;
    setSidebarOpen(false);
    setContextOpen(false);
    setFilmstripOpen(false);
  }, [setSidebarOpen, setContextOpen, setFilmstripOpen]);

  useViewerKeyboardShortcuts({
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
  });

  const { spacePan, spacebarPanRef } = useSpacebarPan();

  return (
    <div className="sb-dashboard-reference-page drawing-viewer-redesign detailing-cc" style={{ padding: 0 }}>
      <style>{drawingViewerStyles}</style>

      <SheetListSidebar
        sidebarOpen={sidebarOpen}
        navigate={navigate}
        search={search}
        setSearch={setSearch}
        filtered={filtered}
        drawings={drawings}
        activeId={activeId}
        setActiveId={setActiveId}
        activeIndex={activeIndex}
      />

      <div className="drawing-viewer-main">
        <ViewerHeader
          projectName={activeProject?.name}
          activeDrawing={activeDrawing}
          drawingSet={activeDrawingSet}
          currentPage={currentPage}
          totalPages={totalPages}
          onUnlock={async (reason) => {
            await handleUnlock(reason);
          }}
        />

        <ViewerToolbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeDrawing={activeDrawing}
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          zoom={zoom}
          setZoom={setZoom}
          handleZoomPreset={handleZoomPreset}
          rotation={rotation}
          setRotation={setRotation}
          renderMode={renderMode}
          setRenderMode={setRenderMode}
          handleDownload={handleDownload}
          pdfDoc={pdfDoc}
          markupScale={markupScale}
          handleAutoDetectScale={handleAutoDetectScale}
          filmstripOpen={filmstripOpen}
          setFilmstripOpen={setFilmstripOpen}
          contextOpen={contextOpen}
          setContextOpen={setContextOpen}
          setShortcutsOpen={setShortcutsOpen}
        />

        <div className="drawing-viewer-pane">
          {overlayView.hasCanvas && (
            <>
              <AnnotationToolbar
                activeTool={activeTool}
                onToolChange={setActiveTool}
                activeColor={activeColor}
                onColorChange={setActiveColor}
                activeStamp={activeStamp}
                onStampChange={setActiveStamp}
                markupCount={overlayView.currentPageMarkupCount}
                onClearPage={() => {
                  markup.items
                    .filter((m) => (m.pdf_page || 1) === currentPage)
                    .forEach((m) => markup.removeItem(m.id));
                }}
                saving={markup.saving}
                saveError={markup.saveError}
              />
              {overlayView.hasCurrentPageNotes && (
                <button
                  type="button"
                  onClick={() => setHideResolved((v) => !v)}
                  title={hideResolved ? "Showing only unresolved notes — click to show all" : "Hide resolved (addressed/rejected) notes"}
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 540,
                    zIndex: 10,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "5px 10px",
                    borderRadius: 4,
                    background: hideResolved ? "rgba(245,158,11,0.15)" : "var(--bg-surface)",
                    border: `1px solid ${hideResolved ? "rgba(245,158,11,0.4)" : "var(--border-default)"}`,
                    color: hideResolved ? "#f59e0b" : "var(--text-muted)",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {hideResolved ? "Unresolved Only" : "Show All"}
                </button>
              )}
            </>
          )}

          {overlayView.hasCanvas && (
            <ZonesFloatingToolbar
              zoneMode={zoneMode}
              setZoneMode={setZoneMode}
              setSelectedZoneId={setSelectedZoneId}
              filteredZones={filteredZones}
              zones={zones}
              zoneOverlay={zoneOverlay}
              setZoneOverlay={setZoneOverlay}
              showDeps={showDeps}
              setShowDeps={setShowDeps}
              drawShape={drawShape}
              setDrawShape={setDrawShape}
              activeDrawing={activeDrawing}
              proposalPanelOpen={proposalPanelOpen}
              setProposalPanelOpen={setProposalPanelOpen}
              pendingProposalCount={pendingProposalCount}
              currentRevision={currentRevision}
              handleNewRevision={handleNewRevision}
            />
          )}

          {overlayView.showZoneFilter && (
            <ZoneFilterBar
              filter={zoneFilter}
              onChange={setZoneFilter}
              statusCounts={zoneStatusCounts}
              totalVisible={overlayView.visibleZoneCount}
              totalAll={overlayView.totalZoneCount}
            />
          )}
          <div
            className={`drawing-viewer-canvas-scroll ${spacePan ? "is-panning" : ""}`}
            onWheel={handleCanvasWheel}
            ref={(el) => {
              if (!el) return;
              if (el._panBound) return;
              el._panBound = true;
              let panning = false;
              let startX = 0, startY = 0, scrollX = 0, scrollY = 0;
              el.addEventListener("mousedown", (ev) => {
                const shouldPan = (ev.button === 0 && spacebarPanRef.current) || ev.button === 1;
                if (!shouldPan) return;
                ev.preventDefault();
                panning = true;
                startX = ev.clientX; startY = ev.clientY;
                scrollX = el.scrollLeft; scrollY = el.scrollTop;
                el.style.cursor = "grabbing";
              });
              const stop = () => { if (panning) { panning = false; el.style.cursor = spacebarPanRef.current ? "grab" : ""; } };
              el.addEventListener("mouseup", stop);
              el.addEventListener("mouseleave", stop);
              el.addEventListener("mousemove", (ev) => {
                if (!panning) return;
                el.scrollLeft = scrollX - (ev.clientX - startX);
                el.scrollTop  = scrollY - (ev.clientY - startY);
              });
            }}
            style={{
              cursor: spacePan ? "grab" : "default",
            }}
          >
            {!activeDrawing ? (
              <div className="drawing-viewer-empty-state">
                <div className="drawing-viewer-empty-icon">DWG</div>
                <p className="drawing-viewer-empty-title">Select a sheet</p>
                <p className="drawing-viewer-empty-copy">Choose a drawing from the sheet navigator to open the PDF, markups, zones, RFIs, and related set context.</p>
              </div>
            ) : !activeDrawing.file_url ? (
              <div className="drawing-viewer-empty-state">
                <div className="drawing-viewer-empty-icon">PDF</div>
                <p className="drawing-viewer-empty-title">No PDF attached</p>
                <p className="drawing-viewer-empty-copy">This sheet exists in the register, but it does not have a file URL attached yet.</p>
              </div>
            ) : renderMode === "iframe" ? (
              !resolvedUrl ? (
                <div className="drawing-viewer-empty-state">
                  <div className="drawing-viewer-empty-icon">...</div>
                  <p className="drawing-viewer-empty-title">Resolving file</p>
                  <p className="drawing-viewer-empty-copy">Preparing the signed drawing URL.</p>
                </div>
              ) : (
                <iframe
                  key={resolvedUrl}
                  src={resolvedUrl}
                  title={activeDrawing.title || activeDrawing.sheet_number}
                  style={{ width: "100%", height: "100%", border: "none", background: PDF_PAGE_BACKGROUND }}
                />
              )
            ) : pdfError ? (
              <div className="drawing-viewer-empty-state">
                <div className="drawing-viewer-empty-icon">!</div>
                <p className="drawing-viewer-empty-title" style={{ color: "var(--status-error)" }}>{pdfError}</p>
                <p className="drawing-viewer-empty-copy">Canvas mode could not load this PDF. Browser PDF mode may still open the file.</p>
                <button
                  onClick={() => setRenderMode("iframe")}
                  style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 12, padding: "7px 14px", background: "rgba(200,155,32,0.12)", border: "1px solid var(--accent)", borderRadius: 6, cursor: "pointer", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  Switch to browser PDF
                </button>
                {activeDrawing.file_url && (
                  <button
                    onClick={async () => {
                      try {
                        const url = await resolveFileUrl(activeDrawing.file_url);
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      } catch { /* silently fail */ }
                    }}
                    style={{ ...mono, fontSize: 10, color: "var(--accent)", margin: "8px auto 0", display: "block", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Open in new tab
                  </button>
                )}
              </div>
            ) : !resolvedUrl || !pdfDoc ? (
              <div className="drawing-viewer-paper-wrap">
                <RenderSkeleton label={!resolvedUrl ? "Resolving drawing file…" : "Loading PDF…"} />
              </div>
            ) : (
              <div className="drawing-viewer-paper-wrap">
                {rendering && (
                  <RenderSkeleton label={`Rendering page ${currentPage}${totalPages > 1 ? ` of ${totalPages}` : ""}`} />
                )}

                <div style={{ position: "relative", display: "inline-block" }}>
                  <canvas
                    ref={canvasRef}
                    style={{
                      display: "block",
                      background: PDF_PAGE_BACKGROUND,
                    }}
                  />

                  <PdfLinkHotspotLayer
                    linkHotspots={linkHotspots}
                    canvasRef={canvasRef}
                    annotLayerRef={null} // Use null as we are refactoring and can clean this up later or move it to the controller
                    onAnnotationClick={handleAnnotationClick}
                  />

                  <AnnotationLayer
                    viewport={currentViewport}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                    pdfPage={currentPage}
                    items={markup.items}
                    activeTool={activeTool}
                    activeColor={activeColor}
                    activeStamp={activeStamp}
                    markupScale={markupScale}
                    onAddItem={markup.addItem}
                    onRemoveItem={markup.removeItem}
                    onUpdateItem={markup.updateItem}
                    onCalibrate={handleCalibrate}
                    hideResolved={hideResolved}
                  />

                  <ZoneLayer
                    mode={zoneMode}
                    drawShape={drawShape}
                    overlay={zoneOverlay}
                    zoneDensities={zoneDensities}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                    zones={filteredZones}
                    zoneSummaries={zoneSummaries}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={setSelectedZoneId}
                    onOpenZone={(zid) => { setSelectedZoneId(zid); setPanelZoneId(zid); }}
                    onDrawComplete={handleZoneDrawComplete}
                    proposalOverlays={hoveredProposal ? [{
                      id: hoveredProposal.id,
                      x_min: Number(hoveredProposal.x_min),
                      y_min: Number(hoveredProposal.y_min),
                      x_max: Number(hoveredProposal.x_max),
                      y_max: Number(hoveredProposal.y_max),
                      status: hoveredProposal.status,
                      label: hoveredProposal.suggested_label,
                    }] : []}
                    dependencyEdges={dependencyEdges}
                    showDependencies={showDeps}
                  />

                  <CalloutOverlay
                    activeDrawing={activeDrawing}
                    drawings={drawings}
                    pageSize={pageSize}
                    zoom={zoom}
                    onCalloutClick={onCalloutClick}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {filmstripOpen && drawings.length > 0 && (
          <ThumbnailFilmstrip
            drawings={filtered.length > 0 ? filtered : drawings}
            activeId={activeId}
            onSelect={setActiveId}
            resolveUrl={resolveFileUrl}
            extractStoragePath={extractStoragePathFromSignedUrl}
          />
        )}

        <div className="drawing-viewer-bottom-hints">
          {[["Left/Right", "Navigate sheets"], ["+/-", "Zoom"], ["0", "Reset zoom"], ["[ ]", "Toggle sidebar"], ["Page Up/Dn", "PDF pages"]].map(([key, desc]) => (
            <span key={key} className="drawing-viewer-hint">
              <strong>{key}</strong> {desc}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            style={{
              marginLeft: "auto",
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            All shortcuts (?)
          </button>
        </div>
      </div>

      {contextOpen && activeDrawing && (
        <ContextPanel
          activeDrawing={activeDrawing}
          allDrawings={drawings}
          onSelect={setActiveId}
          onClose={() => setContextOpen(false)}
          drawingRevisionId={currentRevision?.id || null}
          isSetLocked={!!activeDrawingSet?.is_locked}
        />
      )}

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <ProposalPanel
        open={proposalPanelOpen && !panelZoneId}
        onClose={() => { setProposalPanelOpen(false); setHoveredProposal(null); }}
        projectId={projectId}
        drawing={activeDrawing}
        drawingRevisionId={currentRevision?.id}
        analysisId={null}
        userId={userId}
        onHoverProposal={setHoveredProposal}
        onProposalsChange={() => {
          refetchZones();
        }}
      />

      <ZonePanel
        zone={panelZoneId ? zones.find((z) => z.id === panelZoneId) : null}
        sheet={zonePanelSheet}
        open={!!panelZoneId}
        onClose={() => setPanelZoneId(null)}
        userId={userId}
        onZoneUpdate={async (patch) => {
          if (!panelZoneId) return;
          await handleZoneUpdate(panelZoneId, patch);
        }}
        onZoneDelete={async () => {
          if (!panelZoneId) return;
          await handleZoneDelete(panelZoneId);
          setPanelZoneId(null);
          setSelectedZoneId(null);
        }}
        onSheetNavigate={(drawingId) => {
          if (!drawingId) return;
          setPanelZoneId(null);
          setSelectedZoneId(null);
          setActiveId(drawingId);
        }}
      />

      {activeDrawing && (
        <button
          type="button"
          onClick={() => setExportMarkupOpen(true)}
          title="Export markup summary PDF"
          className="drawing-viewer-export-markups"
        >
          Export Markups
        </button>
      )}
      {exportMarkupOpen && (
        <Suspense fallback={null}>
          <ExportMarkupPDFModal
            open={exportMarkupOpen}
            onClose={() => setExportMarkupOpen(false)}
            project={activeProject}
            activeDrawing={activeDrawing}
            drawings={drawings}
          />
        </Suspense>
      )}
    </div>
  );
}
