import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface InlineTextProps {
  value?: string;
  onCommit: (value: string) => void;
  required?: boolean;
  style?: CSSProperties;
  placeholder?: string;
}

export function InlineText({
  value,
  onCommit,
  required,
  style,
  placeholder,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (required && !next) {
      setDraft(value || "");
      setEditing(false);
      return;
    }
    if (next === (value || "")) {
      setEditing(false);
      return;
    }
    onCommit(next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          ...style,
          cursor: "text",
          padding: "2px 0",
          borderBottom: "1px dashed transparent",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.borderBottom =
            "1px dashed var(--border-default)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.borderBottom = "1px dashed transparent";
        }}
      >
        {value || (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            {placeholder || "—"}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      style={{
        ...style,
        width: "100%",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 3,
        padding: "2px 6px",
        outline: "none",
      }}
    />
  );
}

interface InlineTextareaProps {
  value?: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}

export function InlineTextarea({
  value,
  onCommit,
  placeholder,
}: InlineTextareaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    if ((draft || "") === (value || "")) {
      setEditing(false);
      return;
    }
    onCommit(draft || "");
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          padding: "8px 10px",
          background: "var(--bg-surface-low)",
          border: "1px dashed var(--border-default)",
          borderRadius: 4,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: value ? "normal" : "italic",
          cursor: "text",
          minHeight: 40,
        }}
      >
        {value || placeholder || "Click to add notes"}
      </div>
    );
  }

  return (
    <textarea
      autoFocus
      rows={4}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        } else if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          commit();
        }
      }}
      style={{
        width: "100%",
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "var(--font-body)",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        resize: "vertical",
        outline: "none",
      }}
    />
  );
}

interface EditableMetaProps {
  label: string;
  value?: unknown;
  displayValue?: string;
  kind?: "text" | "date" | "select";
  choices?: string[];
  allowClear?: boolean;
  warn?: unknown;
  onCommit: (value: unknown) => void;
}

export function EditableMeta({
  label,
  value,
  displayValue,
  kind = "text",
  choices,
  allowClear,
  warn,
  onCommit,
}: EditableMetaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = (next?: unknown) => {
    const resolved = next === undefined ? draft : next;
    if ((resolved ?? "") === (value ?? "")) {
      setEditing(false);
      return;
    }
    onCommit(resolved === "" ? null : resolved);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const labelElement = (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}
    >
      {label}
    </div>
  );

  if (!editing) {
    const shownRaw = displayValue ?? value;
    const shownLabel =
      shownRaw === null || shownRaw === undefined || shownRaw === ""
        ? "—"
        : String(shownRaw);
    return (
      <div>
        {labelElement}
        <div
          onClick={() => setEditing(true)}
          title="Click to edit"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: warn
              ? "var(--status-error)"
              : shownLabel !== "—"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            fontWeight: warn ? 700 : 500,
            cursor: "text",
            padding: "2px 0",
            borderBottom: "1px dashed transparent",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderBottom =
              "1px dashed var(--border-default)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderBottom =
              "1px dashed transparent";
          }}
        >
          {shownLabel}
        </div>
      </div>
    );
  }

  const baseStyle: CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    background: "var(--bg-input, var(--bg-surface-low))",
    border: "1px solid var(--accent)",
    borderRadius: 3,
    padding: "2px 6px",
    outline: "none",
  };

  if (kind === "select") {
    return (
      <div>
        {labelElement}
        <select
          autoFocus
          value={(draft as string) || ""}
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          style={baseStyle}
        >
          {allowClear && <option value="">— none —</option>}
          {(choices ?? []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (kind === "date") {
    return (
      <div>
        {labelElement}
        <input
          type="date"
          autoFocus
          value={(draft as string) || ""}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          style={baseStyle}
        />
      </div>
    );
  }

  return (
    <div>
      {labelElement}
      <input
        autoFocus
        value={(draft as string) || ""}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        style={baseStyle}
      />
    </div>
  );
}
