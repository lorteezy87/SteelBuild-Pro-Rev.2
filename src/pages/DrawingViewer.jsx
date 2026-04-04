import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PDFRenderer from "../components/viewer/PDFRenderer.jsx";
import ViewerToolbar from "../components/viewer/ViewerToolbar.jsx";
import SheetList from "../components/viewer/SheetList.jsx";
import MarkupCanvas from "../components/viewer/MarkupCanvas.jsx";
import MarkupToolbar from "../components/viewer/MarkupToolbar.jsx";
import MarkupPropertiesPanel from "../components/viewer/MarkupPropertiesPanel.jsx";
import MarkupsList from "../components/viewer/MarkupsList.jsx";
import AIAnalysisPanel from "../components/viewer/AIAnalysisPanel.jsx";
import { extractPDFText } from "../components/shared/pdfHandling";
import { toast } from "sonner";

const STAMPS = [
  { id: "approved", label: "APPROVED", color: "#00D68F" },
  { id: "rejected", label: "REJECTED", color: "#FF3D3D" },
  { id: "for_review", label: "FOR REVIEW", color: "#FFB020" },
  { id: "void", label: "VOID", color: "var(--accent)" },
  { id: "bfa", label: "BFA", color: "#00B8D9" },
  { id: "ifc", label: "IFC", color: "#00D68F" },
];

export default function DrawingViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const docId = searchParams.get("docId");
  const drawingId = searchParams.get("drawingId");
  const fromPage = searchParams.get("from") || "documents";

  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [markupMode, setMarkupMode] = useState(false);
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState("var(--accent)");
  const [activeStamp, setActiveStamp] = useState(STAMPS[0]);
  const [activeLineWidth, setActiveLineWidth] = useState(2);
  const [activeOpacity, setActiveOpacity] = useState(100);
  const [selectedMarkup, setSelectedMarkup] = useState(null);
  const [markups, setMarkups] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "unsaved"
  const [analysisResults, setAnalysisResults] = useState(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [totalPages, setTotalPages] = useState(1);

  const pdfCanvasRef = useRef(null);
  const markupCanvasRef = useRef(null);

  // --- Load from Drawing entity (Submittals) ---
  const { data: drawingRecord, isLoading: drawingLoading } = useQuery({
    queryKey: ["drawing", drawingId],
    queryFn: () => base44.entities.Drawing.get(drawingId),
    enabled: !!drawingId,
  });

  // --- Load from Document entity (Document Repo) ---
  const { data: docRecord, isLoading: docLoading } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => (docId ? base44.entities.Document.get(docId) : null),
    enabled: !!docId && !drawingId,
  });

  const isLoading = drawingLoading || docLoading;

  // Unified record abstraction
  const record = drawingRecord || docRecord;
  const fileUrl = drawingRecord?.file_url || docRecord?.fileUrl;
  const recordTitle = drawingRecord
    ? `${drawingRecord.sheet_number} – ${drawingRecord.title}`
    : docRecord?.displayName || "Drawing";
  const recordMeta = drawingRecord
    ? `${drawingRecord.drawing_set_name || ""} Rev ${drawingRecord.revision_number || 0}`
    : `${docRecord?.drawingNumber || ""} Rev ${docRecord?.revisionNumber || 0}`;
  const viewerDocument = {
    documentNumber: drawingRecord?.sheet_number || docRecord?.drawingNumber || "",
    displayName: recordTitle,
    revisionNumber: drawingRecord?.revision_number || docRecord?.revisionNumber || 0,
  };

  // Load markups from record
  useEffect(() => {
    const stored = drawingRecord?.annotations || docRecord?.markups;
    if (stored) {
      try {
        const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
        setMarkups(Array.isArray(parsed) ? parsed : []);
        setUndoStack([]);
      } catch {
        setMarkups([]);
        setUndoStack([]);
      }
    } else {
      setMarkups([]);
      setUndoStack([]);
    }
  }, [drawingRecord?.id, docRecord?.id]);

  // Auto-save markups (debounced)
  const saveTimerRef = useRef(null);
  const saveMarkups = (newMarkups) => {
    setSaveStatus("unsaved");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        if (drawingRecord) {
          await base44.entities.Drawing.update(drawingRecord.id, {
            annotations: JSON.stringify(newMarkups),
          });
        } else if (docRecord) {
          await base44.entities.Document.update(docRecord.id, { markups: newMarkups });
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
  };

  const handleAddMarkup = (markup) => {
    setMarkups((prev) => {
      setUndoStack((stack) => [...stack, prev]);
      const next = [...prev, {
        ...markup,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        lineWidth: activeLineWidth,
        opacity: activeOpacity,
      }];
      saveMarkups(next);
      return next;
    });
  };

  const handleDeleteMarkup = (markupId) => {
    setMarkups((prev) => {
      setUndoStack((stack) => [...stack, prev]);
      const next = prev.filter((m) => m.id !== markupId);
      saveMarkups(next);
      return next;
    });
    if (selectedMarkup?.id === markupId) setSelectedMarkup(null);
  };

  const handleUpdateMarkup = (markupId, updates) => {
    setMarkups((prev) => {
      const next = prev.map((m) => (m.id === markupId ? { ...m, ...updates } : m));
      saveMarkups(next);
      return next;
    });
    setSelectedMarkup((prev) => prev?.id === markupId ? { ...prev, ...updates } : prev);
  };

  const handleUndoMarkups = useCallback((previousMarkups) => {
    if (!previousMarkups) return;
    setMarkups(previousMarkups);
    saveMarkups(previousMarkups);
    setSelectedMarkup(null);
  }, []);

  const popUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previousMarkups = stack[stack.length - 1];
      handleUndoMarkups(previousMarkups);
      return stack.slice(0, -1);
    });
  }, [handleUndoMarkups]);

  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") {
        setSelectedMarkup(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (undoStack.length) {
          handleUndoMarkups(undoStack[undoStack.length - 1]);
          setUndoStack((stack) => stack.slice(0, -1));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoStack, handleUndoMarkups]);

  const handleRunAIAnalysis = async () => {
    if (!record || !fileUrl) return;
    setAnalysisRunning(true);
    try {
      const pdfText = await extractPDFText(fileUrl);
      if (!pdfText.trim()) {
        throw new Error("Unable to extract readable text from this PDF.");
      }
      const response = await base44.functions.invoke("runDrawingAnalysis", {
        pdfText: pdfText.slice(0, 8000),
        drawingNumber: drawingRecord?.sheet_number || docRecord?.drawingNumber || recordTitle,
        displayName: drawingRecord?.title || docRecord?.displayName || recordTitle,
        discipline: drawingRecord?.discipline || docRecord?.discipline || "Structural",
        revisionNumber: drawingRecord?.revision_number || docRecord?.revisionNumber || 0,
        markupCount: markups.length,
        linkedRFIs: [],
      });
      const results = response?.data || response;
      if (!results || typeof results !== "object") {
        throw new Error("Analysis returned an invalid response.");
      }
      setAnalysisResults(results);
      if (docRecord?.id) {
        await base44.entities.Document.update(docRecord.id, {
          lastAnalysis: results,
          lastAnalysisDate: new Date().toISOString(),
        });
      }
      toast.success("Drawing analysis complete");
    } catch (err) {
      console.error("Analysis failed:", err);
      toast.error(err?.message || "AI analysis failed");
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleSaveNow = async () => {
    clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    try {
      if (drawingRecord) {
        await base44.entities.Drawing.update(drawingRecord.id, {
          annotations: JSON.stringify(markups),
        });
      } else if (docRecord) {
        await base44.entities.Document.update(docRecord.id, { markups });
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(200,210,230,0.60)" }}>
        Loading drawing...
      </div>
    );
  }

  if (!fileUrl) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ color: "rgba(200,210,230,0.60)", marginBottom: 16 }}>
          {record ? "No PDF file attached to this drawing." : "Drawing not found."}
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "8px 16px",
            background: "var(--accent-glow)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  const pageMarkups = markups.filter((m) => (m.page || 1) === currentPage);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-page)",
        display: "flex",
        flexDirection: "column",
        zIndex: 5000,
      }}
    >
      {/* Top toolbar */}
      <ViewerToolbar
        document={viewerDocument}
        markupMode={markupMode}
        onToggleMarkupMode={() => { setMarkupMode((m) => !m); setSelectedMarkup(null); }}
        onRunAIAnalysis={handleRunAIAnalysis}
        analysisRunning={analysisRunning}
        onBack={() => navigate(-1)}
        zoomLevel={zoomLevel}
        onZoom={setZoomLevel}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />

      {/* Main content area */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left panel - Sheet list (only for Document entity) */}
        {docRecord && (
          <SheetList document={docRecord} currentPage={currentPage} onPageChange={setCurrentPage} />
        )}

        {/* Center - Viewer canvas */}
        <div style={{ flex: 1, position: "relative", background: "var(--bg-page)", overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
          {/* Canvas wrapper — both canvases live inside here so they scroll together */}
          <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
            <PDFRenderer
              fileUrl={fileUrl}
              currentPage={currentPage}
              zoomLevel={zoomLevel}
              canvasRef={pdfCanvasRef}
              onTotalPages={setTotalPages}
            />

            {/* Markup overlay — absolute on top of PDF canvas */}
            <MarkupCanvas
              markups={pageMarkups}
              selectedMarkup={selectedMarkup}
              zoomLevel={zoomLevel}
              activeTool={markupMode ? activeTool : "select"}
              markupMode={markupMode}
              activeColor={activeColor}
              activeStamp={activeStamp}
              activeLineWidth={activeLineWidth}
              activeOpacity={activeOpacity}
              drawingRecord={drawingRecord}
              pdfCanvasRef={pdfCanvasRef}
              onAddMarkup={(m) => handleAddMarkup({ ...m, page: currentPage })}
              onSelectMarkup={setSelectedMarkup}
              onUpdateMarkup={handleUpdateMarkup}
              onDeleteMarkup={handleDeleteMarkup}
            />
          </div>

          {/* Markup toolbar (floating left sidebar) */}
          {markupMode && (
            <MarkupToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              activeColor={activeColor}
              onColorChange={setActiveColor}
              activeStamp={activeStamp}
              onStampChange={setActiveStamp}
              stamps={STAMPS}
              lineWidth={activeLineWidth}
              onLineWidthChange={setActiveLineWidth}
              opacity={activeOpacity}
              onOpacityChange={setActiveOpacity}
              onUndo={popUndo}
            />
          )}
        </div>

        {/* Right panel */}
        {analysisResults ? (
          <AIAnalysisPanel
            results={analysisResults}
            document={docRecord}
            onClose={() => setAnalysisResults(null)}
            onCreateRFI={() => {}}
          />
        ) : markupMode && selectedMarkup ? (
          <MarkupPropertiesPanel
            markup={selectedMarkup}
            onUpdate={(updates) => handleUpdateMarkup(selectedMarkup.id, updates)}
            onDelete={() => handleDeleteMarkup(selectedMarkup.id)}
          />
        ) : (
          <MarkupsList
            markups={pageMarkups}
            allMarkups={markups}
            onSelectMarkup={(m) => { setSelectedMarkup(m); if (!markupMode) setMarkupMode(true); }}
            onDelete={handleDeleteMarkup}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          height: 28,
          background: "var(--bg-surface)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "rgba(200,210,230,0.60)",
          gap: 16,
        }}
      >
        <div>Page {currentPage} of {totalPages}</div>
        <div>Zoom: {Math.round(zoomLevel * 100)}%</div>
        <div style={{ flex: 1, textAlign: "center", color: "rgba(200,210,230,0.80)" }}>{recordTitle}</div>
        <div style={{ color: drawingRecord?.stage ? "#00B8D9" : docRecord?.ifc_status === "IFC" ? "#00D68F" : "#FFB020" }}>
          ● {drawingRecord?.stage || docRecord?.ifc_status || "Draft"}
        </div>
        {/* Save status */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: saveStatus === "unsaved" ? "pointer" : "default" }}
          onClick={saveStatus === "unsaved" ? handleSaveNow : undefined}
          title={saveStatus === "unsaved" ? "Click to save now" : ""}
        >
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: saveStatus === "saved" ? "#00D68F" : saveStatus === "saving" ? "#FFB020" : "#FF3D3D",
          }} />
          <span style={{ color: saveStatus === "saved" ? "#00D68F" : saveStatus === "saving" ? "#FFB020" : "#FF3D3D" }}>
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved — click to save"}
          </span>
        </div>
      </div>
    </div>
  );
}
