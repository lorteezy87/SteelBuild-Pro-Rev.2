import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  const [crossRefs, setCrossRefs] = useState([]);
  const [detectingRefs, setDetectingRefs] = useState(false);
  const [showCrossRefs, setShowCrossRefs] = useState(true);
  const [allSetDrawings, setAllSetDrawings] = useState([]);
  const [rightPanel, setRightPanel] = useState("sheets");
  const [sheetSearch, setSheetSearch] = useState("");

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

  // --- Load all drawings in the same set (for Drawing entity) ---
  const { data: setDrawings = [] } = useQuery({
    queryKey: ["set-drawings", drawingRecord?.drawing_set_name, drawingRecord?.project_id],
    queryFn: () => base44.entities.Drawing.filter({
      drawing_set_name: drawingRecord.drawing_set_name,
      project_id: drawingRecord.project_id,
    }),
    enabled: !!drawingRecord?.drawing_set_name,
  });

  useEffect(() => {
    setAllSetDrawings(setDrawings);
  }, [setDrawings]);

  // Load cross-refs from drawing record annotations
  useEffect(() => {
    if (drawingRecord?.annotations?.crossRefs) {
      setCrossRefs(drawingRecord.annotations.crossRefs);
    }
  }, [drawingRecord]);

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
      // Arrow key sheet navigation (only when not editing a markup)
      if (!markupMode && allSetDrawings.length > 1) {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          const idx = allSetDrawings.findIndex(s => s.id === drawingId);
          const next = allSetDrawings[idx + 1];
          if (next) { const p = new URLSearchParams(searchParams); p.set("drawingId", next.id); navigate(`?${p.toString()}`); }
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          const idx = allSetDrawings.findIndex(s => s.id === drawingId);
          const prev = allSetDrawings[idx - 1];
          if (prev) { const p = new URLSearchParams(searchParams); p.set("drawingId", prev.id); navigate(`?${p.toString()}`); }
        }
      }
      // +/- zoom
      if (!event.ctrlKey && !event.metaKey) {
        if (event.key === "+" || event.key === "=") setZoomLevel(z => Math.min(z + 0.25, 4));
        if (event.key === "-") setZoomLevel(z => Math.max(z - 0.25, 0.25));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoStack, handleUndoMarkups, markupMode, allSetDrawings, drawingId, searchParams, navigate]);

  const handleDownload = () => {
    if (!fileUrl) return;
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `${recordTitle.replace(/[^a-z0-9]/gi, "_")}.pdf`;
    a.target = "_blank";
    a.click();
  };

  const handleFitWidth = () => {
    const container = document.querySelector("[data-pdf-container]");
    const canvas = pdfCanvasRef.current;
    if (!canvas || !container) return;
    const containerWidth = container.clientWidth - 32;
    const canvasNaturalWidth = canvas.width / (window.devicePixelRatio || 1);
    if (canvasNaturalWidth > 0) setZoomLevel(prev => (containerWidth / canvasNaturalWidth) * prev);
  };

  const handleRunAIAnalysis = async () => {
    if (!docRecord) return;
    setAnalysisRunning(true);
    try {
      const pdfText = await extractPDFText(docRecord.fileUrl);
      const response = await base44.functions.invoke("runDrawingAnalysis", {
        pdfText: pdfText.slice(0, 8000),
        drawingNumber: docRecord.drawingNumber,
        displayName: docRecord.displayName,
        discipline: docRecord.discipline,
        revisionNumber: docRecord.revisionNumber,
        markupCount: markups.length,
        linkedRFIs: [],
      });
      setAnalysisResults(response.data);
      await base44.entities.Document.update(docRecord.id, {
        lastAnalysis: response.data,
        lastAnalysisDate: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalysisRunning(false);
    }
  };

  const detectCrossReferences = async () => {
    if (!drawingRecord || detectingRefs) return;
    setDetectingRefs(true);
    try {
      const otherSheets = allSetDrawings
        .filter(d => d.id !== drawingRecord.id)
        .map(d => `${d.sheet_number}: ${d.title}`)
        .join(", ");

      const prompt = `You are analyzing an engineering drawing: "${drawingRecord.sheet_number} - ${drawingRecord.title}".

Other sheets in this drawing set: ${otherSheets || "none provided"}

Analyze this drawing for callout references such as:
- Section markers (e.g., "SECTION A-A", "SECTION 1/603E105")
- Elevation callouts (e.g., "ELEVATION", "ELEV 1/S-101")
- Detail bubbles (e.g., "DETAIL 1", "SEE DET 3/A-201")
- Reference arrows pointing to other sheets
- Keynote references

For each reference found, provide:
1. The label text as it appears
2. The approximate position on the drawing (as percentage of width and height, e.g., x: 0.35, y: 0.72)
3. The target sheet number if determinable (match against the sheet list above)

Return a JSON array: [{"label": "SECTION A", "x": 0.35, "y": 0.72, "targetSheet": "603E104"}]

If no references are found, return: []

Drawing file URL for reference: ${fileUrl}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
        response_json_schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              targetSheet: { type: "string" }
            }
          }
        }
      });

      const refs = Array.isArray(result) ? result : [];
      setCrossRefs(refs);

      // Save to drawing annotations
      const existingAnnotations = drawingRecord?.annotations || {};
      await base44.entities.Drawing.update(drawingRecord.id, {
        annotations: { ...existingAnnotations, crossRefs: refs }
      });

      toast.success(`Found ${refs.length} cross-reference${refs.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error("Cross-reference detection failed: " + (err?.message || "unknown error"));
    } finally {
      setDetectingRefs(false);
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
        document={docRecord || { displayName: recordTitle }}
        markupMode={markupMode}
        onToggleMarkupMode={() => { setMarkupMode((m) => !m); setSelectedMarkup(null); }}
        onRunAIAnalysis={handleRunAIAnalysis}
        analysisRunning={analysisRunning}
        onBack={() => navigate(-1)}
        zoomLevel={zoomLevel}
        onZoom={setZoomLevel}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onDownload={handleDownload}
        onFitWidth={handleFitWidth}
        recordTitle={recordTitle}
        recordMeta={recordMeta}
      />

      {/* Main content area */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left panel - Sheet list (only for Document entity) */}
        {docRecord && (
          <SheetList document={docRecord} currentPage={currentPage} onPageChange={setCurrentPage} />
        )}

        {/* Center - Viewer canvas */}
        <div data-pdf-container style={{ flex: 1, position: "relative", background: "var(--bg-page)", overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
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

            {/* Cross-reference hotspots overlay */}
            {showCrossRefs && crossRefs.length > 0 && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
                {crossRefs.map((ref, i) => {
                  const targetDrawing = allSetDrawings.find(d =>
                    d.sheet_number === ref.targetSheet ||
                    d.sheet_number?.includes(ref.targetSheet)
                  );
                  return (
                    <div
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (targetDrawing) {
                          const params = new URLSearchParams(searchParams);
                          params.set("drawingId", targetDrawing.id);
                          navigate(`?${params.toString()}`);
                        }
                      }}
                      title={`${ref.label}${ref.targetSheet ? ` → Sheet ${ref.targetSheet}` : ""}`}
                      style={{
                        position: "absolute",
                        left: `${ref.x * 100}%`,
                        top: `${ref.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: targetDrawing ? "rgba(200,155,32,0.85)" : "rgba(59,130,246,0.85)",
                        border: "2px solid rgba(255,255,255,0.8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: targetDrawing ? "pointer" : "default",
                        pointerEvents: "all",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                        transition: "transform 0.1s, background 0.1s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.15)"; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = "translate(-50%, -50%)"; }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1, padding: "0 2px", whiteSpace: "nowrap", maxWidth: 28, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ref.label.slice(0, 4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
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

          {/* Cross-reference detection buttons (floating top-right in canvas area) */}
          {drawingRecord && (
            <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 6, zIndex: 30 }}>
              <button
                onClick={detectCrossReferences}
                disabled={detectingRefs}
                style={{
                  padding: "5px 10px",
                  background: detectingRefs ? "rgba(200,155,32,0.3)" : "rgba(200,155,32,0.15)",
                  border: "1px solid rgba(200,155,32,0.5)",
                  color: "var(--accent)",
                  borderRadius: 4,
                  cursor: detectingRefs ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                {detectingRefs ? "DETECTING…" : "DETECT REFS"}
              </button>
              {crossRefs.length > 0 && (
                <button
                  onClick={() => setShowCrossRefs(v => !v)}
                  style={{
                    padding: "5px 10px",
                    background: showCrossRefs ? "rgba(200,155,32,0.15)" : "rgba(80,80,100,0.3)",
                    border: "1px solid rgba(200,155,32,0.3)",
                    color: showCrossRefs ? "var(--accent)" : "rgba(200,210,230,0.50)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {showCrossRefs ? `REFS ON · ${crossRefs.length}` : `REFS OFF · ${crossRefs.length}`}
                </button>
              )}
            </div>
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
        ) : drawingRecord ? (
          <div style={{ display: "flex", flexDirection: "column", width: 220, flexShrink: 0, borderLeft: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
            {/* Panel toggle buttons */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--divider)" }}>
              {["sheets", "markups", "analysis"].map(panel => (
                <button
                  key={panel}
                  onClick={() => setRightPanel(panel)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    background: rightPanel === panel ? "rgba(200,155,32,0.08)" : "transparent",
                    border: "none",
                    borderBottom: rightPanel === panel ? "2px solid var(--accent)" : "2px solid transparent",
                    color: rightPanel === panel ? "var(--accent)" : "rgba(200,210,230,0.50)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {panel}
                </button>
              ))}
            </div>

            {/* Sheets panel */}
            {rightPanel === "sheets" && allSetDrawings.length > 0 && (() => {
              const filteredSheets = allSetDrawings.filter(s =>
                !sheetSearch ||
                s.sheet_number?.toLowerCase().includes(sheetSearch.toLowerCase()) ||
                s.title?.toLowerCase().includes(sheetSearch.toLowerCase())
              );
              const currentIdx = allSetDrawings.findIndex(s => s.id === drawingId);
              return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>SHEETS · {allSetDrawings.length}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button disabled={currentIdx <= 0} onClick={() => { const prev = allSetDrawings[currentIdx - 1]; if (prev) { const p = new URLSearchParams(searchParams); p.set("drawingId", prev.id); navigate(`?${p.toString()}`); }}} style={{ padding: "2px 6px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--divider)", borderRadius: 3, color: currentIdx <= 0 ? "var(--text-muted)" : "var(--text-primary)", cursor: currentIdx <= 0 ? "not-allowed" : "pointer", fontSize: 10 }}>‹</button>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", alignSelf: "center" }}>{currentIdx + 1}/{allSetDrawings.length}</span>
                    <button disabled={currentIdx >= allSetDrawings.length - 1} onClick={() => { const next = allSetDrawings[currentIdx + 1]; if (next) { const p = new URLSearchParams(searchParams); p.set("drawingId", next.id); navigate(`?${p.toString()}`); }}} style={{ padding: "2px 6px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--divider)", borderRadius: 3, color: currentIdx >= allSetDrawings.length - 1 ? "var(--text-muted)" : "var(--text-primary)", cursor: currentIdx >= allSetDrawings.length - 1 ? "not-allowed" : "pointer", fontSize: 10 }}>›</button>
                  </div>
                </div>
                <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--divider)" }}>
                  <input placeholder="Search sheets…" value={sheetSearch} onChange={e => setSheetSearch(e.target.value)} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 9, outline: "none" }} />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredSheets.map(sheet => (
                  <div
                    key={sheet.id}
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("drawingId", sheet.id);
                      navigate(`?${params.toString()}`);
                    }}
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      background: sheet.id === drawingId ? "rgba(200,155,32,0.08)" : "transparent",
                      borderLeft: sheet.id === drawingId ? "3px solid var(--accent)" : "3px solid transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (sheet.id !== drawingId) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (sheet.id !== drawingId) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: sheet.id === drawingId ? "var(--accent)" : "var(--text-muted)" }}>{sheet.sheet_number}</span>
                      {sheet.ifc_status === "IFC" && <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: "#00D68F", background: "rgba(0,214,143,0.12)", border: "1px solid rgba(0,214,143,0.22)", borderRadius: 3, padding: "1px 4px" }}>IFC</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheet.title}</div>
                  </div>
                ))}
                {filteredSheets.length === 0 && <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>No sheets match</div>}
                </div>
              </div>
              );
            })()}

            {/* Markups panel */}
            {rightPanel === "markups" && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <MarkupsList
                  markups={pageMarkups}
                  allMarkups={markups}
                  onSelectMarkup={(m) => { setSelectedMarkup(m); if (!markupMode) setMarkupMode(true); }}
                  onDelete={handleDeleteMarkup}
                  currentPage={currentPage}
                  totalPages={totalPages}
                />
              </div>
            )}

            {/* Analysis panel placeholder */}
            {rightPanel === "analysis" && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(200,210,230,0.40)", fontFamily: "var(--font-mono)", fontSize: 9, textAlign: "center", padding: 16 }}>
                Run AI Analysis from the toolbar to see results here.
              </div>
            )}
          </div>
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
