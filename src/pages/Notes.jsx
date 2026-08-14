/**
 * Notes — Tools notepad: typed text + Apple Pencil / stylus ink.
 *
 * Ink is stored as vector strokes (pressure, undo, paper) in localStorage.
 * Pointer Events: coalesced + predicted samples, palm rejection, Pencil double-tap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eraser,
  Highlighter,
  PenLine,
  Plus,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { InkCanvas, setInkPaper } from "@/components/notes/InkCanvas";
import {
  acceptPointer,
  deserializeInk,
  emptyInk,
  isPencilDoubleTap,
  serializeInk,
  undoStroke,
} from "@/lib/notesInk/engine";
import { INK_COLORS, INK_SIZES } from "@/lib/notesInk/types";

const LS_KEY = "sbp-tools-notes";

function loadNotes() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => ({
      ...n,
      ink: n.ink ? deserializeInk(typeof n.ink === "string" ? n.ink : JSON.stringify(n.ink)) : emptyInk(),
    }));
  } catch {
    return [];
  }
}

function persistNotes(notes) {
  try {
    const payload = notes.map((n) => ({
      ...n,
      ink: n.ink ? serializeInk(n.ink) : serializeInk(emptyInk()),
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function newNote() {
  return {
    id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: "Untitled",
    text: "",
    ink: emptyInk("ruled"),
    updatedAt: new Date().toISOString(),
  };
}

export default function Notes() {
  const [notes, setNotes] = useState(loadNotes);
  const [activeId, setActiveId] = useState(() => loadNotes()[0]?.id ?? null);
  const [mode, setMode] = useState("text"); // text | ink
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [size, setSize] = useState(INK_SIZES[1].value);
  const [palmReject, setPalmReject] = useState(true);
  const [penLive, setPenLive] = useState(false);
  const redo = useRef([]);
  const penSeenAt = useRef(null);
  const lastPenTap = useRef(null);
  const themeInk = useMemo(() => {
    if (typeof window === "undefined") return "#1A1C1E";
    const dark = document.documentElement.classList.contains("steelbuild-dark")
      || document.documentElement.getAttribute("data-theme") === "dark";
    return dark ? "#F4F1EA" : "#1A1C1E";
  }, []);

  const active = notes.find((n) => n.id === activeId) || null;

  useEffect(() => {
    persistNotes(notes);
  }, [notes]);

  const updateActive = useCallback((patch) => {
    if (!activeId) return;
    setNotes((prev) =>
      prev.map((n) => (n.id === activeId ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
    );
  }, [activeId]);

  const createNote = () => {
    const n = newNote();
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
    setMode("text");
    redo.current = [];
  };

  const deleteNote = (id) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    redo.current = [];
  };

  const setInk = (ink) => {
    updateActive({ ink });
  };

  const undoInk = () => {
    if (!active?.ink) return;
    const { next, popped } = undoStroke(active.ink);
    if (!popped) return;
    redo.current.push(popped);
    setInk(next);
  };

  const redoInk = () => {
    const stroke = redo.current.pop();
    if (!stroke || !active?.ink) return;
    setInk({ ...active.ink, strokes: [...active.ink.strokes, stroke] });
  };

  const markPen = () => {
    penSeenAt.current = Date.now();
    if (!penLive) setPenLive(true);
  };

  const acceptEvent = (e) => {
    if (e.pointerType === "pen") {
      const tap = { t: e.timeStamp || Date.now(), x: e.clientX, y: e.clientY };
      if (e.type === "pointerdown" && isPencilDoubleTap(lastPenTap.current, tap)) {
        lastPenTap.current = null;
        setTool((t) => (t === "eraser" ? "pen" : "eraser"));
        setMode("ink");
        return false;
      }
      if (e.type === "pointerdown") lastPenTap.current = tap;
      markPen();
    }
    return acceptPointer({
      pointerType: e.pointerType,
      penSeenAt: penSeenAt.current,
      now: Date.now(),
      palmReject,
    });
  };

  const exportPng = () => {
    const canvas = document.querySelector("canvas[aria-label='Ink canvas']");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${(active?.title || "note").replace(/[^\w.-]+/g, "_")}-ink.png`;
    a.click();
  };

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{
        display: "flex",
        height: "calc(100vh - 64px)",
        minHeight: 420,
        background: "var(--bg-page, var(--bg-surface-low))",
      }}
    >
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
          <button type="button" onClick={createNote} aria-label="New note" title="New note" style={iconBtn()}>
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
          {notes.length === 0 && (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
              No notes yet. Tap + to create one.
            </div>
          )}
          {notes.map((n) => {
            const selected = n.id === activeId;
            const inkCount = n.ink?.strokes?.length || 0;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveId(n.id);
                  redo.current = [];
                }}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
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
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteNote(n.id);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                  {n.updatedAt
                    ? new Date(n.updatedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                  {inkCount > 0 ? ` · ${inkCount} stroke${inkCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!active ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 14 }}>
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
                gap: 8,
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
                active={mode === "ink" && tool === "pen"}
                onClick={() => {
                  setMode("ink");
                  setTool("pen");
                }}
                label="Pencil"
                icon={<PenLine size={14} />}
              />
              <ToolBtn
                active={mode === "ink" && tool === "highlighter"}
                onClick={() => {
                  setMode("ink");
                  setTool("highlighter");
                }}
                label="Highlight"
                icon={<Highlighter size={14} />}
              />
              <ToolBtn
                active={mode === "ink" && tool === "eraser"}
                onClick={() => {
                  setMode("ink");
                  setTool("eraser");
                }}
                label="Eraser"
                icon={<Eraser size={14} />}
              />
              <ToolBtn onClick={undoInk} label="Undo stroke" icon={<Undo2 size={14} />} />
              <ToolBtn onClick={redoInk} label="Redo stroke" icon={<Redo2 size={14} />} />
              <ToolBtn onClick={exportPng} label="Export ink" icon={<Download size={14} />} />
            </div>

            {mode === "ink" && (
              <div
                style={{
                  padding: "8px 16px",
                  borderBottom: "1px solid var(--divider)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  background: "var(--bg-surface-low)",
                }}
              >
                <span style={metaLabel()}>Color</span>
                {INK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setColor(c.value)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: color === c.value ? "2px solid var(--accent)" : "1px solid var(--border-default)",
                      background: c.value,
                      cursor: "pointer",
                      boxShadow: c.id === "chalk" ? "inset 0 0 0 1px rgba(0,0,0,0.15)" : undefined,
                    }}
                  />
                ))}
                <span style={metaLabel()}>Nib</span>
                {INK_SIZES.map((s) => (
                  <ToolBtn
                    key={s.id}
                    active={size === s.value}
                    onClick={() => setSize(s.value)}
                    label={s.label}
                  />
                ))}
                <span style={metaLabel()}>Paper</span>
                {["plain", "ruled", "grid"].map((p) => (
                  <ToolBtn
                    key={p}
                    active={(active.ink?.paper || "ruled") === p}
                    onClick={() => setInk(setInkPaper(active.ink || emptyInk(), p))}
                    label={p[0].toUpperCase() + p.slice(1)}
                  />
                ))}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={palmReject}
                    onChange={(e) => setPalmReject(e.target.checked)}
                  />
                  Palm reject
                </label>
                {penLive && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--accent)",
                    }}
                  >
                    Pencil live · double-tap toggles eraser
                  </span>
                )}
              </div>
            )}

            <div style={{ flex: 1, position: "relative", minHeight: 0, background: "var(--bg-page, transparent)" }}>
              <textarea
                value={active.text}
                onChange={(e) => updateActive({ text: e.target.value })}
                placeholder="Type notes here. Switch to Pencil to ink with Apple Pencil — pressure, tilt, and palm rejection are on."
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
                  background: "transparent",
                  color: "var(--text-primary)",
                  pointerEvents: mode === "text" ? "auto" : "none",
                  zIndex: 1,
                }}
              />
              <InkCanvas
                doc={active.ink || emptyInk()}
                onChange={(ink) => {
                  redo.current = [];
                  setInk(ink);
                }}
                tool={tool}
                color={color}
                size={size}
                mode={mode === "ink" ? "ink" : "text"}
                acceptEvent={acceptEvent}
                onPenSeen={markPen}
                themeInk={themeInk}
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

function iconBtn() {
  return {
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
  };
}

function metaLabel() {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };
}
