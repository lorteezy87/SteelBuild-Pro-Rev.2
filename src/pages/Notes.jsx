/**
 * Notes — Tools category notepad with text + freehand ink (Apple Pencil / stylus).
 *
 * Persistence: localStorage (device-local). Pointer Events support pen/touch/mouse.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, PenLine, Type, Eraser, Undo2 } from "lucide-react";

const LS_KEY = "sbp-tools-notes";

function loadNotes() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes));
  } catch {
    /* quota / private mode */
  }
}

function newNote() {
  const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title: "Untitled",
    text: "",
    inkDataUrl: null,
    updatedAt: new Date().toISOString(),
  };
}

export default function Notes() {
  const [notes, setNotes] = useState(loadNotes);
  const [activeId, setActiveId] = useState(() => {
    const list = loadNotes();
    return list[0]?.id ?? null;
  });
  const [mode, setMode] = useState("text"); // text | pen | eraser
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef(null);

  const active = notes.find((n) => n.id === activeId) || null;

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  // Load ink onto canvas when switching notes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (active?.inkDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = active.inkDataUrl;
    }
  }, [activeId, active?.inkDataUrl]);

  const updateActive = useCallback((patch) => {
    if (!activeId) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeId
          ? { ...n, ...patch, updatedAt: new Date().toISOString() }
          : n,
      ),
    );
  }, [activeId]);

  const createNote = () => {
    const n = newNote();
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
    setMode("text");
  };

  const deleteNote = (id) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const persistInk = () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeId) return;
    try {
      const url = canvas.toDataURL("image/png");
      updateActive({ inkDataUrl: url });
    } catch {
      /* tainted canvas unlikely */
    }
  };

  const clearInk = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    updateActive({ inkDataUrl: null });
  };

  const pointerPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    if (mode === "text") return;
    // Prefer pen; still allow touch/mouse for desktop testing
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current = pointerPos(e);
  };

  const onPointerMove = (e) => {
    if (!drawing.current || mode === "text") return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pt = pointerPos(e);
    const prev = lastPt.current || pt;

    // Pressure-aware stroke when Apple Pencil reports pressure
    const pressure = typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5;
    const width = mode === "eraser" ? 18 : 1.5 + pressure * 4;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    if (mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "var(--text-primary, #111)";
    }
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  };

  const onPointerUp = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    persistInk();
  };

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{
        display: "flex",
        height: "calc(100vh - 64px)",
        minHeight: 420,
        gap: 0,
        background: "var(--bg-page, var(--bg-surface-low))",
      }}
    >
      {/* Sidebar list */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid var(--divider)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            padding: "14px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "var(--text-muted)",
            }}
          >
            NOTES
          </span>
          <button
            type="button"
            onClick={createNote}
            aria-label="New note"
            title="New note"
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)",
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {notes.length === 0 && (
            <div
              style={{
                padding: 16,
                color: "var(--text-muted)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              No notes yet. Tap + to create one.
            </div>
          )}
          {notes.map((n) => {
            const selected = n.id === activeId;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActiveId(n.id);
                }}
                style={{
                  padding: "10px 10px",
                  borderRadius: 8,
                  marginBottom: 4,
                  cursor: "pointer",
                  background: selected
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : "transparent",
                  border: selected
                    ? "1px solid color-mix(in srgb, var(--accent) 35%, transparent)"
                    : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 600 : 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {n.title || "Untitled"}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(n.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: 2,
                      display: "flex",
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 4,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n.updatedAt
                    ? new Date(n.updatedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!active ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 14,
            }}
          >
            Select or create a note
          </div>
        ) : (
          <>
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--divider)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <input
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Title"
                style={{
                  flex: 1,
                  minWidth: 120,
                  fontSize: 16,
                  fontWeight: 600,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                }}
              />
              <ToolBtn
                active={mode === "text"}
                onClick={() => setMode("text")}
                label="Type"
                icon={<Type size={14} />}
              />
              <ToolBtn
                active={mode === "pen"}
                onClick={() => setMode("pen")}
                label="Pencil"
                icon={<PenLine size={14} />}
              />
              <ToolBtn
                active={mode === "eraser"}
                onClick={() => setMode("eraser")}
                label="Eraser"
                icon={<Eraser size={14} />}
              />
              <ToolBtn onClick={clearInk} label="Clear ink" icon={<Undo2 size={14} />} />
            </div>

            <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
              <textarea
                value={active.text}
                onChange={(e) => updateActive({ text: e.target.value })}
                placeholder="Type notes here…"
                readOnly={mode !== "text"}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  resize: "none",
                  border: "none",
                  outline: "none",
                  padding: 20,
                  fontSize: 15,
                  lineHeight: 1.55,
                  fontFamily: "var(--font-body)",
                  background: "var(--bg-page, transparent)",
                  color: "var(--text-primary)",
                  pointerEvents: mode === "text" ? "auto" : "none",
                  zIndex: 1,
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  touchAction: "none",
                  cursor: mode === "text" ? "default" : "crosshair",
                  zIndex: 2,
                  pointerEvents: mode === "text" ? "none" : "auto",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ToolBtn({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 10px",
        borderRadius: 6,
        border: active
          ? "1px solid color-mix(in srgb, var(--accent) 50%, transparent)"
          : "1px solid var(--border-default)",
        background: active
          ? "color-mix(in srgb, var(--accent) 14%, transparent)"
          : "var(--bg-surface-low)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--font-body)",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
