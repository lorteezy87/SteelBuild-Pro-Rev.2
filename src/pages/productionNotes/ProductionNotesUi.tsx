/**
 * Presentational rows for Production Notes.
 */
// @ts-nocheck
import React from "react";
import { Plus, Trash2, Highlighter } from "lucide-react";

export function BulletRow({ note, projectId, isLast, onCreateNext, onUpdateBulletText, onToggleHighlight, onDeleteBullet }) {
  const [text, setText] = useState(note.content || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setText(note.content || "");
  }, [note.id, note.content]);

  const commit = () => {
    const trimmed = text.replace(/\s+$/, "");
    if (trimmed !== (note.content || "")) {
      onUpdateBulletText(note, trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
      if (isLast) {
        if (text.trim()) onCreateNext();
      } else {
        const all = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
        const idx = Array.from(all).indexOf(e.currentTarget);
        if (idx >= 0 && all[idx + 1]) all[idx + 1].focus();
      }
    } else if (e.key === "Backspace" && text === "" && !note._optimistic) {
      e.preventDefault();
      const all = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
      const idx = Array.from(all).indexOf(e.currentTarget);
      onDeleteBullet(note);
      setTimeout(() => {
        const updated = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
        if (updated[idx - 1]) updated[idx - 1].focus();
      }, 50);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      onToggleHighlight(note);
    }
  };

  const highlighted = !!note.is_high_priority;

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 6px",
        borderRadius: 4,
        background: highlighted ? "color-mix(in srgb, var(--status-warning) 18%, transparent)" : "transparent",
        borderLeft: highlighted ? "3px solid var(--status-warning)" : "3px solid transparent",
        transition: "background 0.15s",
      }}
      className="bullet-row"
    >
      <span style={{ color: highlighted ? "var(--status-warning)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 1.5, paddingTop: 1, userSelect: "none" }}>•</span>
      <textarea
        ref={inputRef}
        data-bullet-input
        value={text}
        rows={1}
        onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={isLast ? "Type a bullet — Enter for next, Ctrl+H to highlight" : ""}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.55, padding: "1px 0", fontWeight: highlighted ? 600 : 400 }}
      />
      <div className="bullet-actions" style={{ display: "flex", gap: 4, opacity: 0.65, transition: "opacity 0.15s" }}>
        <button title="Highlight (Ctrl+H)" onClick={() => onToggleHighlight(note)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid transparent", background: highlighted ? "color-mix(in srgb, var(--status-warning) 25%, transparent)" : "transparent", color: highlighted ? "var(--status-warning)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Highlighter size={12} />
        </button>
        <button title="Delete bullet" onClick={() => onDeleteBullet(note)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid transparent", background: "transparent", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function ProjectRow({ row, onUpdateBulletText, onToggleHighlight, onDeleteBullet, onAddBullet }) {
  const { project, bullets, projectId } = row;
  const renderable = bullets.length > 0 ? bullets : [];

  return (
    <div data-bullet-project={projectId} style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderTop: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
      <div style={{ padding: "14px 18px", borderRight: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column", gap: 4, minHeight: 60 }}>
        {project.project_number && (<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.1em" }}>{project.project_number}</span>)}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, wordBreak: "break-word" }}>{project.name}</span>
        {project.gc_name && (<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{project.gc_name}</span>)}
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
        {renderable.map((note, idx) => (
          <BulletRow
            key={note.id}
            note={note}
            projectId={projectId}
            isLast={idx === renderable.length - 1}
            onCreateNext={() => onAddBullet(projectId, "")}
            onUpdateBulletText={onUpdateBulletText}
            onToggleHighlight={onToggleHighlight}
            onDeleteBullet={onDeleteBullet}
          />
        ))}
        <button onClick={() => onAddBullet(projectId, "")} style={{ alignSelf: "flex-start", marginTop: 4, padding: "3px 8px", borderRadius: 4, border: "1px dashed var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--divider)"; }}>
          <Plus size={11} /> Add bullet
        </button>
      </div>
    </div>
  );
}

// ─── Style helpers ───────────────────────────────────────────────────────────
export function navBtn() {
  return {
    width: 32,
    height: 32,
    borderRadius: "var(--radius-btn)",
    border: "1px solid var(--border-default)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
