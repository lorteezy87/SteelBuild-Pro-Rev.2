/**
 * ApproverNotesPanel — questions for EOR/AOR + the approver's response.
 *
 * Unanswered notes flag the package Incomplete — Pending EOR/AOR Response.
 * No <form> tags.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  INCOMPLETE_EOR_AOR_LABEL,
  evaluateApproverNotes,
  newApproverNoteId,
  parseApproverNotes,
  serializeApproverNotes,
  type ApproverNote,
} from "@/lib/approverNotes";

export interface ApproverNotesPanelProps {
  notes?: unknown;
  busy?: boolean;
  onChange: (next: ApproverNote[]) => void | Promise<void>;
}

export default function ApproverNotesPanel({
  notes,
  busy = false,
  onChange,
}: ApproverNotesPanelProps) {
  const parsed = parseApproverNotes(notes);
  const [draftNote, setDraftNote] = useState("");
  const [rows, setRows] = useState<ApproverNote[]>(parsed);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows(parseApproverNotes(notes));
  }, [notes]);

  const status = evaluateApproverNotes(rows);

  const commit = (next: ApproverNote[]) => {
    const serialized = serializeApproverNotes(next);
    setRows(serialized);
    return onChange(serialized);
  };

  const handleAdd = async () => {
    if (busy || !draftNote.trim()) return;
    const next: ApproverNote = {
      id: newApproverNoteId(),
      note: draftNote.trim(),
      response: "",
      created_at: new Date().toISOString(),
      responded_at: null,
    };
    setDraftNote("");
    await commit([...rows, next]);
  };

  const handleResponse = async (id: string, response: string) => {
    const next = rows.map((row) =>
      row.id === id
        ? {
            ...row,
            response,
            responded_at: response.trim() ? new Date().toISOString() : null,
          }
        : row,
    );
    setRows(next);
  };

  const handleResponseBlur = async () => {
    await commit(rowsRef.current);
  };

  const handleRemove = async (id: string) => {
    if (busy) return;
    await commit(rows.filter((row) => row.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.04em",
          lineHeight: 1.45,
        }}
      >
        Questions for EOR / AOR. Each note needs an approver response before this
        package is complete.
      </div>

      {status.label && (
        <div
          role="status"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--status-warning)",
            background: "var(--status-review-muted, color-mix(in srgb, var(--status-warning) 12%, transparent))",
            border: "1px solid color-mix(in srgb, var(--status-warning) 40%, transparent)",
            borderRadius: 3,
            padding: "7px 10px",
          }}
        >
          {INCOMPLETE_EOR_AOR_LABEL}
          {status.unansweredCount > 1 ? ` · ${status.unansweredCount} unanswered` : ""}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
          No approver notes yet. Add the questions that need to go to the EOR / AOR.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, index) => {
            const unanswered = row.note.trim().length > 0 && row.response.trim().length === 0;
            return (
              <div
                key={row.id}
                style={{
                  border: unanswered
                    ? "1px solid color-mix(in srgb, var(--status-warning) 45%, var(--divider))"
                    : "1px solid var(--divider)",
                  borderRadius: 3,
                  padding: "8px 10px",
                  background: "var(--bg-surface, transparent)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={labelStyle}>
                    Approver Note {index + 1}
                    {unanswered && (
                      <span style={{ color: "var(--status-warning)", marginLeft: 6 }}>UNANSWERED</span>
                    )}
                  </span>
                  <div style={{ ...boxStyle, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                    {row.note}
                  </div>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={labelStyle}>Approver Response</span>
                  <textarea
                    value={row.response}
                    disabled={busy}
                    rows={3}
                    placeholder="EOR / AOR response…"
                    onChange={(e) => handleResponse(row.id, e.target.value)}
                    onBlur={() => handleResponseBlur()}
                    style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleRemove(row.id)}
                  disabled={busy}
                  style={{
                    gridColumn: "1 / -1",
                    justifySelf: "flex-start",
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  Remove note
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          borderTop: "1px dashed var(--divider)",
          paddingTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span style={labelStyle}>Add Approver Note</span>
        <textarea
          value={draftNote}
          disabled={busy}
          rows={2}
          placeholder="Question for EOR / AOR…"
          onChange={(e) => setDraftNote(e.target.value)}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <button
          type="button"
          className="sbd-btn-primary"
          disabled={busy || !draftNote.trim()}
          onClick={handleAdd}
          style={{ opacity: busy || !draftNote.trim() ? 0.55 : 1 }}
        >
          Add approver note
        </button>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8.5,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  borderRadius: 2,
  border: "1px solid var(--divider)",
  background: "var(--bg-surface, transparent)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body, inherit)",
  fontSize: 12,
  padding: "6px 8px",
  width: "100%",
};

const boxStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 64,
  lineHeight: 1.4,
};
