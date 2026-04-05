import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const LABEL_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

function SketchCanvas({ value, onChange, height = 200 }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#ADC6FF");
  const [lineWidth, setLineWidth] = useState(2);
  const lastPoint = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0E0E10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPoint.current = getPos(e, canvas);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    const pressure = e.pressure ?? 0.5;
    const width = tool === "eraser" ? 20 : lineWidth * (0.5 + pressure);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? "#0E0E10" : color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPoint.current = pos;
  };

  const endDraw = (e) => {
    e?.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas && onChange) onChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0E0E10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange && onChange(null);
  };

  const COLORS = ["#ADC6FF", "#4AE176", "#F59E0B", "#EF4444", "#DDB7FF", "#FFFFFF"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        {["pen", "eraser"].map((t) => (
          <button key={t} type="button" onClick={() => setTool(t)} style={{
            padding: "3px 10px", borderRadius: 4,
            border: `1px solid ${tool === t ? "var(--accent)" : "var(--border-default)"}`,
            background: tool === t ? "var(--accent-muted)" : "transparent",
            color: tool === t ? "var(--accent)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            cursor: "pointer", textTransform: "uppercase",
          }}>
            {t === "pen" ? "✏ Pen" : "⌫ Eraser"}
          </button>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>Size:</span>
          {[1, 2, 4, 8].map((w) => (
            <button key={w} type="button" onClick={() => setLineWidth(w)} style={{
              width: 20, height: 20, borderRadius: "50%", cursor: "pointer",
              border: `1px solid ${lineWidth === w ? "var(--accent)" : "var(--border-default)"}`,
              background: lineWidth === w ? "var(--accent-muted)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: Math.min(w * 2, 14), height: Math.min(w * 2, 14),
                borderRadius: "50%", background: lineWidth === w ? "var(--accent)" : "var(--text-muted)",
              }} />
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => { setColor(c); setTool("pen"); }} style={{
              width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
              border: `2px solid ${color === c && tool === "pen" ? "#fff" : "transparent"}`,
            }} />
          ))}
        </div>

        <button type="button" onClick={clearCanvas} style={{
          marginLeft: "auto", padding: "3px 10px", borderRadius: 4,
          border: "1px solid var(--danger-border)", background: "transparent",
          color: "var(--status-error)", fontFamily: "var(--font-mono)",
          fontSize: 8, fontWeight: 700, cursor: "pointer",
        }}>
          CLEAR
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={height * 2}
        style={{
          width: "100%", height: height, borderRadius: 6,
          border: "1px solid var(--border-default)",
          cursor: tool === "eraser" ? "cell" : "crosshair",
          display: "block", touchAction: "none",
        }}
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
        onPointerCancel={endDraw}
      />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.08em" }}>
        Apple Pencil, stylus, or mouse supported
      </div>
    </div>
  );
}

const DEFAULT_FORM = (projectId) => ({
  project_id: projectId || "",
  note_date: new Date().toISOString().split("T")[0],
  author: "",
  category: "General",
  content: "",
  is_high_priority: false,
  sketch_data: null,
});

export default function ProductionNoteFormModal({ projectId, onClose, note = null, onSave }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(note ? { ...note, sketch_data: note.sketch_data || null } : DEFAULT_FORM(projectId));

  useEffect(() => {
    setFormData(note ? { ...note } : DEFAULT_FORM(projectId));
  }, [note, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.ProductionNote.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-notes"] });
      toast.success("Production note created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (note) {
      onSave && onSave(formData);
      onClose();
    } else {
      mutation.mutate(formData);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 20px 0",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          {note ? "Edit Note" : "New Production Note"}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Project */}
          <div>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Project
            </label>
            <select
              value={formData.project_id}
              onChange={(e) =>
                setFormData({ ...formData, project_id: e.target.value })
              }
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
              required
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date, Author, Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Date
              </label>
              <input
                type="date"
                value={formData.note_date}
                onChange={(e) =>
                  setFormData({ ...formData, note_date: e.target.value })
                }
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
                required
              />
            </div>

            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Author
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                <option value="General">General</option>
                <option value="Safety">Safety</option>
                <option value="Quality">Quality</option>
                <option value="Schedule">Schedule</option>
                <option value="Fabrication">Fabrication</option>
                <option value="Erection">Erection</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
                minHeight: "100px",
                resize: "vertical",
              }}
              required
            />
          </div>

          {/* Sketch */}
          <div>
            <label style={LABEL_STYLE}>
              Sketch / Handwritten Notes
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginLeft: 8, letterSpacing: "0.08em" }}>
                OPTIONAL
              </span>
            </label>
            <SketchCanvas
              value={formData.sketch_data}
              onChange={(data) => setFormData((f) => ({ ...f, sketch_data: data }))}
              height={220}
            />
          </div>

          {/* High Priority */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="high-priority"
              checked={formData.is_high_priority}
              onChange={(e) =>
                setFormData({ ...formData, is_high_priority: e.target.checked })
              }
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <label
              htmlFor="high-priority"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Mark as High Priority
            </label>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 16px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: mutation.isPending ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: mutation.isPending ? 0.5 : 1,
              }}
            >
              {mutation.isPending ? (note ? "Saving..." : "Creating...") : (note ? "Save Changes" : "Create Note")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}