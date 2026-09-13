import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Highlighter, Plus, Trash2 } from "lucide-react";
import type {
  ProductionNotePatch,
  ProductionNoteProjectRow,
  ProductionNoteRecord,
} from "@/pages/productionNotes/productionNotesDerive";

interface ProductionNoteRowsProps {
  rows: ProductionNoteProjectRow[];
  onUpdateBulletText: (note: ProductionNoteRecord, text: string) => void;
  onUpdateBulletDates: (note: ProductionNoteRecord, patch: ProductionNotePatch) => void;
  onToggleHighlight: (note: ProductionNoteRecord) => void;
  onDeleteBullet: (note: ProductionNoteRecord) => void;
  onAddBullet: (projectId: string, content?: string) => void;
}

export function ProductionNoteRows({
  rows,
  onUpdateBulletText,
  onUpdateBulletDates,
  onToggleHighlight,
  onDeleteBullet,
  onAddBullet,
}: ProductionNoteRowsProps) {
  return rows.map((row) => (
    <ProjectRow
      key={row.projectId}
      row={row}
      onUpdateBulletText={onUpdateBulletText}
      onUpdateBulletDates={onUpdateBulletDates}
      onToggleHighlight={onToggleHighlight}
      onDeleteBullet={onDeleteBullet}
      onAddBullet={onAddBullet}
    />
  ));
}

interface BulletRowProps {
  note: ProductionNoteRecord;
  projectId: string;
  isLast: boolean;
  onCreateNext: () => void;
  onUpdateBulletText: ProductionNoteRowsProps["onUpdateBulletText"];
  onUpdateBulletDates: ProductionNoteRowsProps["onUpdateBulletDates"];
  onToggleHighlight: ProductionNoteRowsProps["onToggleHighlight"];
  onDeleteBullet: ProductionNoteRowsProps["onDeleteBullet"];
}

function BulletRow({
  note,
  projectId,
  isLast,
  onCreateNext,
  onUpdateBulletText,
  onUpdateBulletDates,
  onToggleHighlight,
  onDeleteBullet,
}: BulletRowProps) {
  const [text, setText] = useState(note.content || "");
  const [dateNoted, setDateNoted] = useState(note.date_noted || "");
  const [dateDue, setDateDue] = useState(note.date_due || "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(note.content || "");
  }, [note.id, note.content]);

  useEffect(() => {
    setDateNoted(note.date_noted || "");
    setDateDue(note.date_due || "");
  }, [note.id, note.date_noted, note.date_due]);

  const isTempId = Boolean(note._optimistic) || note.id.startsWith("tmp-");

  const commit = () => {
    const trimmed = text.replace(/\s+$/, "");
    if (trimmed !== (note.content || "")) {
      onUpdateBulletText(note, trimmed);
    }
  };

  const commitDate = (field: "date_noted" | "date_due", value: string) => {
    if (isTempId) return;
    const next = value || null;
    const previous = note[field] || null;
    if (next === previous) return;
    onUpdateBulletDates(note, { [field]: next });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit();
      if (isLast) {
        if (text.trim()) onCreateNext();
      } else {
        const inputs = document.querySelectorAll<HTMLTextAreaElement>(
          `[data-bullet-project="${projectId}"] [data-bullet-input]`,
        );
        const index = Array.from(inputs).indexOf(event.currentTarget);
        inputs[index + 1]?.focus();
      }
    } else if (event.key === "Backspace" && text === "" && !note._optimistic) {
      event.preventDefault();
      const inputs = document.querySelectorAll<HTMLTextAreaElement>(
        `[data-bullet-project="${projectId}"] [data-bullet-input]`,
      );
      const index = Array.from(inputs).indexOf(event.currentTarget);
      onDeleteBullet(note);
      setTimeout(() => {
        const updated = document.querySelectorAll<HTMLTextAreaElement>(
          `[data-bullet-project="${projectId}"] [data-bullet-input]`,
        );
        updated[index - 1]?.focus();
      }, 50);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "h") {
      event.preventDefault();
      onToggleHighlight(note);
    }
  };

  const highlighted = Boolean(note.is_high_priority);

  return (
    <div
      className="bullet-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "4px 6px",
        borderRadius: 4,
        background: highlighted
          ? "color-mix(in srgb, var(--status-warning) 18%, transparent)"
          : "transparent",
        borderLeft: highlighted
          ? "3px solid var(--status-warning)"
          : "3px solid transparent",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          color: highlighted ? "var(--status-warning)" : "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          lineHeight: 1.5,
          paddingTop: 1,
          userSelect: "none",
        }}
      >
        •
      </span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <textarea
          ref={inputRef}
          data-bullet-input
          value={text}
          rows={1}
          onChange={(event) => {
            setText(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onFocus={(event) => {
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={isLast ? "Type a bullet — Enter for next, Ctrl+H to highlight" : ""}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            lineHeight: 1.55,
            padding: "1px 0",
            fontWeight: highlighted ? 600 : 400,
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <DateField
            label="Noted"
            value={dateNoted}
            onChange={(value) => {
              setDateNoted(value);
              commitDate("date_noted", value);
            }}
          />
          <DateField
            label="Due"
            value={dateDue}
            onChange={(value) => {
              setDateDue(value);
              commitDate("date_due", value);
            }}
          />
        </div>
      </div>
      <div
        className="bullet-actions"
        style={{ display: "flex", gap: 4, opacity: 0.65, transition: "opacity 0.15s" }}
      >
        <button
          title="Highlight (Ctrl+H)"
          onClick={() => onToggleHighlight(note)}
          style={{
            ...actionButtonStyle,
            background: highlighted
              ? "color-mix(in srgb, var(--status-warning) 25%, transparent)"
              : "transparent",
            color: highlighted ? "var(--status-warning)" : "var(--text-muted)",
          }}
        >
          <Highlighter size={12} />
        </button>
        <button
          title="Delete bullet"
          onClick={() => onDeleteBullet(note)}
          style={{ ...actionButtonStyle, color: "var(--text-muted)" }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = "var(--status-error)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function ProjectRow({
  row,
  onUpdateBulletText,
  onUpdateBulletDates,
  onToggleHighlight,
  onDeleteBullet,
  onAddBullet,
}: Omit<ProductionNoteRowsProps, "rows"> & { row: ProductionNoteProjectRow }) {
  const { project, bullets, projectId } = row;

  return (
    <div
      data-bullet-project={projectId}
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        borderTop: "1px solid var(--divider)",
        background: "var(--bg-surface)",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderRight: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 60,
        }}
      >
        {project.project_number && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent)",
              letterSpacing: "0.1em",
            }}
          >
            {project.project_number}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            wordBreak: "break-word",
          }}
        >
          {project.name}
        </span>
        {project.gc_name && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
            }}
          >
            {project.gc_name}
          </span>
        )}
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
        {bullets.map((note, index) => (
          <BulletRow
            key={note.id}
            note={note}
            projectId={projectId}
            isLast={index === bullets.length - 1}
            onCreateNext={() => onAddBullet(projectId, "")}
            onUpdateBulletText={onUpdateBulletText}
            onUpdateBulletDates={onUpdateBulletDates}
            onToggleHighlight={onToggleHighlight}
            onDeleteBullet={onDeleteBullet}
          />
        ))}
        <button
          onClick={() => onAddBullet(projectId, "")}
          style={{
            alignSelf: "flex-start",
            marginTop: 4,
            padding: "3px 8px",
            borderRadius: 4,
            border: "1px dashed var(--divider)",
            background: "transparent",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = "var(--accent)";
            event.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "var(--text-muted)";
            event.currentTarget.style.borderColor = "var(--divider)";
          }}
        >
          <Plus size={11} /> Add bullet
        </button>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        textTransform: "uppercase",
      }}
    >
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          padding: "2px 6px",
          colorScheme: "dark",
        }}
      />
    </label>
  );
}

const actionButtonStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 4,
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
