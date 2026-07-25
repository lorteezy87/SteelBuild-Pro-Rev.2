/**
 * CommentDispositionChecklist — returned-comment disposition editor (Slice 5).
 *
 * Shown on AAN / R&R packages. Required unresolved rows block OFS→IFC and
 * R&R→OFA (see commentDispositionGate). No <form> tags.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import {
  COMMENT_DISPOSITION_STATUSES,
  collectUnresolvedRequiredComments,
  type CommentDispositionStatus,
} from "@/lib/commentDispositionGate";

export interface CommentDispositionRow {
  id: string;
  comment_number?: string | null;
  source?: string | null;
  location?: string | null;
  comment_text?: string | null;
  status?: string | null;
  is_required?: boolean | null;
  resolution?: string | null;
  incorporated_revision?: string | null;
}

export interface CommentDispositionChecklistProps {
  dispositions: CommentDispositionRow[];
  busy?: boolean;
  onAdd: (draft: {
    comment_number: string;
    source: string;
    location: string;
    comment_text: string;
    is_required: boolean;
  }) => void | Promise<void>;
  onUpdateStatus: (id: string, status: CommentDispositionStatus) => void | Promise<void>;
  onUpdateResolution?: (id: string, resolution: string) => void | Promise<void>;
}

export default function CommentDispositionChecklist({
  dispositions,
  busy = false,
  onAdd,
  onUpdateStatus,
  onUpdateResolution,
}: CommentDispositionChecklistProps) {
  const [number, setNumber] = useState("");
  const [source, setSource] = useState("Engineer");
  const [location, setLocation] = useState("");
  const [text, setText] = useState("");
  const [required, setRequired] = useState(true);

  const open = collectUnresolvedRequiredComments(dispositions);

  const handleAdd = async () => {
    if (busy || !text.trim()) return;
    await onAdd({
      comment_number: number.trim() || `C${dispositions.length + 1}`,
      source: source.trim() || "Engineer",
      location: location.trim(),
      comment_text: text.trim(),
      is_required: required,
    });
    setNumber("");
    setLocation("");
    setText("");
    setRequired(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: open.length ? "var(--status-warning)" : "var(--text-muted)",
          letterSpacing: "0.04em",
        }}
      >
        {open.length
          ? `${open.length} required comment(s) unresolved — blocks OFS→IFC and R&R→OFA`
          : "All required returned comments resolved"}
      </div>

      {dispositions.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
          No returned comments tracked yet. Add comments from the AAN / R&R return.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dispositions.map((row) => (
            <div
              key={row.id}
              style={{
                border: "1px solid var(--divider)",
                borderRadius: 2,
                padding: "8px 10px",
                background: "var(--bg-surface, transparent)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 800,
                    color: "var(--accent)",
                  }}
                >
                  {row.comment_number || "—"}
                </span>
                {row.location && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {row.location}
                  </span>
                )}
                {row.source && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
                    {row.source}
                  </span>
                )}
                {row.is_required === false && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                    OPTIONAL
                  </span>
                )}
                <select
                  value={row.status || "Unreviewed"}
                  disabled={busy}
                  onChange={(e) =>
                    onUpdateStatus(row.id, e.target.value as CommentDispositionStatus)
                  }
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    borderRadius: 2,
                    border: "1px solid var(--divider)",
                    background: "var(--bg-page, transparent)",
                    color: "var(--text-primary)",
                    padding: "2px 6px",
                  }}
                >
                  {COMMENT_DISPOSITION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {row.comment_text && (
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: "var(--font-body, inherit)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    lineHeight: 1.4,
                  }}
                >
                  {row.comment_text}
                </div>
              )}
              {onUpdateResolution && (
                <input
                  value={row.resolution || ""}
                  disabled={busy}
                  placeholder="Resolution note…"
                  onChange={(e) => onUpdateResolution(row.id, e.target.value)}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    borderRadius: 2,
                    border: "1px solid var(--divider)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    padding: "4px 6px",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          borderTop: "1px dashed var(--divider)",
          paddingTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Comment #"
          disabled={busy}
          style={inputStyle}
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source (Engineer / GC…)"
          disabled={busy}
          style={inputStyle}
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location / sheet"
          disabled={busy}
          style={{ ...inputStyle, gridColumn: "1 / -1" }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Returned comment text *"
          disabled={busy}
          rows={2}
          style={{ ...inputStyle, gridColumn: "1 / -1", resize: "vertical" }}
        />
        <label
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          <input
            type="checkbox"
            checked={required}
            disabled={busy}
            onChange={(e) => setRequired(e.target.checked)}
            style={{ accentColor: "var(--color-primary)" }}
          />
          Required (gates OFS→IFC / R&R→OFA)
        </label>
        <button
          type="button"
          className="sbd-btn-primary"
          disabled={busy || !text.trim()}
          onClick={handleAdd}
          style={{ gridColumn: "1 / -1", opacity: busy || !text.trim() ? 0.55 : 1 }}
        >
          Add returned comment
        </button>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 2,
  border: "1px solid var(--divider)",
  background: "var(--bg-surface, transparent)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "6px 8px",
};
