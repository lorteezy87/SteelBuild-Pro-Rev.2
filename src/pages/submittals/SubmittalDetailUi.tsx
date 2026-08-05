// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
/**
 * Presentational subcomponents for SubmittalDetail panel.
 * Extracted behavior-identical from SubmittalDetail.tsx.
 */
import type { CSSProperties, ReactNode } from "react";
import { formatDate } from "@/components/shared/formatters";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  DRAWING_TYPES,
  DRAWING_TYPE_ABBR,
  componentState,
  missingDrawingTypes,
  sortComponents,
  type DrawingType,
  type SubmittalComponent,
} from "@/lib/submittalComponents";
import {
  buildDrawingSetsById,
  filterAvailableDrawingSets,
} from "./submittalsPageHelpers";

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

interface DrawingTypeComponentsProps {
  submittalId: string;
  projectId: string;
  components: SubmittalComponent[];
  onSetReceived: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; date: string | null }) => void;
  onSetReleased: (args: { drawingType: DrawingType; existing: SubmittalComponent | null; released: boolean }) => void;
  onAddType: (drawingType: DrawingType) => void;
  onRemoveType: (component: SubmittalComponent) => void;
}

export function DrawingTypeComponents({ components, onSetReceived, onSetReleased, onAddType, onRemoveType }: DrawingTypeComponentsProps) {
  const present = sortComponents(components).filter(
    (component): component is SubmittalComponent & { drawing_type: DrawingType } =>
      (DRAWING_TYPES as readonly string[]).includes(component.drawing_type),
  );
  const missing = missingDrawingTypes(components);

  return (
    <div>
      {present.length === 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 8 }}>
          No drawing types tracked yet. Add Shop, Erection, or Part below to track
          each independently.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {present.map((component) => {
          const state = componentState(component);
          const released = state === "released";
          return (
            <div
              key={component.drawing_type}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--border-default)",
                background: released ? "var(--status-success-bg, var(--success-muted))" : "var(--bg-surface-low)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
                  {DRAWING_TYPE_ABBR[component.drawing_type]}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {component.drawing_type}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Rcvd
                </span>
                <input
                  type="date"
                  value={component.received_date || ""}
                  onChange={(e) => onSetReceived({ drawingType: component.drawing_type, existing: component, date: e.target.value || null })}
                  aria-label={`${component.drawing_type} received date`}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 6px",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)", borderRadius: 3,
                    color: "var(--text-primary)", outline: "none", maxWidth: 140,
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
                <button
                  type="button"
                  onClick={() => onSetReleased({ drawingType: component.drawing_type, existing: component, released: !released })}
                  title={released
                    ? `${component.drawing_type} released${component.released_date ? ` ${formatDate(component.released_date)}` : ""} — click to un-release`
                    : `Release ${component.drawing_type} for fabrication`}
                  style={{
                    padding: "3px 10px", borderRadius: 3, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    border: released ? "1px solid var(--status-success, var(--status-success))" : "1px solid var(--border-default)",
                    background: released ? "var(--status-success, var(--status-success))" : "transparent",
                    color: released ? "var(--on-accent)" : "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {released ? `RELEASED${component.released_date ? ` · ${formatDate(component.released_date)}` : ""}` : "RELEASE"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveType(component)}
                  title={`Stop tracking ${component.drawing_type}`}
                  aria-label={`Remove ${component.drawing_type}`}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "0 2px" }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {missing.map((drawingType) => (
            <button
              key={drawingType}
              type="button"
              onClick={() => onAddType(drawingType)}
              title={`Track ${drawingType} drawings independently`}
              style={{
                padding: "4px 10px", borderRadius: 3, background: "transparent",
                border: "1px dashed var(--border-default)", color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              + {drawingType}
            </button>
          ))}
        </div>
      )}
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

export function InlineText({ value, onCommit, required, style, placeholder }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (required && !next) { setDraft(value || ""); setEditing(false); return; }
    if (next === (value || "")) { setEditing(false); return; }
    onCommit(next);
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

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
        onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
      >
        {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{placeholder || "—"}</span>}
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
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

export function InlineTextarea({ value, onCommit, placeholder }: InlineTextareaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    if ((draft || "") === (value || "")) { setEditing(false); return; }
    onCommit(draft || "");
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

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
        {value || (placeholder || "Click to add notes")}
      </div>
    );
  }
  return (
    <textarea
      autoFocus
      rows={4}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
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

interface LinkedDrawingSetsProps {
  value?: string[];
  allSets?: DrawingSet[];
  onChange?: (next: string[]) => void;
}

export function LinkedDrawingSets({ value = [], allSets = [], onChange }: LinkedDrawingSetsProps) {
  const [picking, setPicking] = useState(false);
  const setsById = useMemo(() => buildDrawingSetsById(allSets), [allSets]);
  const available = useMemo(
    () => filterAvailableDrawingSets(allSets, value),
    [allSets, value],
  );

  const remove = (id: string) => {
    if (!onChange) return;
    onChange(value.filter((entry) => entry !== id));
  };
  const add = (id: string) => {
    if (!onChange || !id) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
    setPicking(false);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {value.length === 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
            No drawing sets linked.
          </span>
        )}
        {value.map((id) => {
          const set = setsById.get(id);
          const label = set
            ? `Set # ${formatDrawingSetNumber(set)} · ${set.set_name || "(unnamed set)"}${set.revision ? ` · R${set.revision}` : ""}`
            : "(missing set)";
          return (
            <span
              key={id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 4px 3px 10px", borderRadius: 999,
                background: set ? "var(--accent-muted)" : "var(--bg-surface-high)",
                color: set ? "var(--accent)" : "var(--text-muted)",
                border: set ? "1px solid var(--accent)" : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                maxWidth: 360,
              }}
              title={set?.discipline ? `${label} · ${set.discipline}` : label}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              <button
                onClick={() => remove(id)}
                title="Unlink this drawing set"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "inherit", padding: "0 4px", fontSize: 12, lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {picking ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => add(e.target.value)}
          onBlur={() => setPicking(false)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 8px",
            background: "var(--bg-input)",
            border: "1px solid var(--accent)", borderRadius: 3,
            color: "var(--text-primary)", outline: "none",
            maxWidth: "100%",
          }}
        >
          <option value="">— pick a drawing set —</option>
          {available.length === 0 && (
            <option disabled value="__none">
              No more sets to link
            </option>
          )}
          {available.map((set) => (
            <option key={set.id} value={set.id}>
              {`Set # ${formatDrawingSetNumber(set)} · ${set.set_name || "(unnamed set)"}${set.revision ? ` · R${set.revision}` : ""}`}
              {set.discipline ? ` · ${set.discipline}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          title={available.length === 0 ? "All project drawing sets are already linked" : "Link a drawing set to this submittal"}
          style={{
            padding: "4px 10px", borderRadius: 3,
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color: available.length === 0 ? "var(--text-muted)" : "var(--accent)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: available.length === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase",
          }}
        >
          + Link drawing set
        </button>
      )}
    </div>
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

export function EditableMeta({ label, value, displayValue, kind = "text", choices, allowClear, warn, onCommit }: EditableMetaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = (next?: unknown) => {
    const resolved = next === undefined ? draft : next;
    if ((resolved ?? "") === (value ?? "")) { setEditing(false); return; }
    onCommit(resolved === "" ? null : resolved);
    setEditing(false);
  };
  const cancel = () => { setDraft(value ?? ""); setEditing(false); };

  const labelEl = (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2 }}>
      {label}
    </div>
  );

  if (!editing) {
    const shownRaw = displayValue ?? value;
    const shownLabel =
      shownRaw === null || shownRaw === undefined || shownRaw === ""
        ? "—"
        : typeof shownRaw === "string" || typeof shownRaw === "number"
          ? String(shownRaw)
          : String(shownRaw);
    return (
      <div>
        {labelEl}
        <div
          onClick={() => setEditing(true)}
          title="Click to edit"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: warn ? "var(--status-error)" : (shownLabel !== "—" ? "var(--text-primary)" : "var(--text-muted)"),
            fontWeight: warn ? 700 : 500,
            cursor: "text",
            padding: "2px 0",
            borderBottom: "1px dashed transparent",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
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
        {labelEl}
        <select
          autoFocus
          value={(draft as string) || ""}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => commit()}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
          style={baseStyle}
        >
          {allowClear && <option value="">— none —</option>}
          {(choices ?? []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      </div>
    );
  }

  if (kind === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          autoFocus
          value={(draft as string) || ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          style={baseStyle}
        />
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <input
        autoFocus
        value={(draft as string) || ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        style={baseStyle}
      />
    </div>
  );
}
