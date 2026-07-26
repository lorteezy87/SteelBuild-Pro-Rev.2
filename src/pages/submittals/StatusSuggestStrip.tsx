/**
 * Post-status suggest strip — Apply / Edit / Dismiss for BIC + dates.
 * Package/workflow stage hard-syncs from SoT without waiting for Apply.
 */
import { useEffect, useState } from "react";
import type { StatusSuggestPatch } from "@/lib/submittalLinkGlue";
import { BIC_CHOICES } from "./format";

export interface StatusSuggestStripProps {
  patch: StatusSuggestPatch;
  busy?: boolean;
  onApply: (patch: StatusSuggestPatch) => void | Promise<void>;
  onDismiss: () => void;
}

export default function StatusSuggestStrip({
  patch,
  busy = false,
  onApply,
  onDismiss,
}: StatusSuggestStripProps) {
  const [draft, setDraft] = useState<StatusSuggestPatch>(patch);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(patch);
    setEditing(false);
  }, [patch]);

  const bits: string[] = [];
  if ("ball_in_court" in draft) {
    bits.push(draft.ball_in_court ? `BIC → ${draft.ball_in_court}` : "BIC → Closed");
  }
  if (draft.submitted_date) bits.push(`Submitted ${draft.submitted_date}`);
  if (draft.returned_date) bits.push(`Returned ${draft.returned_date}`);
  if (draft.approved_date) bits.push(`Approved ${draft.approved_date}`);

  return (
    <div
      role="region"
      aria-label="Suggested submittal field updates"
      style={{
        margin: "0 0 12px",
        padding: "10px 12px",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid var(--color-primary)",
        borderRadius: 2,
        background: "color-mix(in srgb, var(--color-primary) 6%, transparent)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
        SUGGESTED UPDATES — stage already reflects status; confirm BIC/dates
      </div>
      {!editing ? (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)" }}>
          {bits.join(" · ") || "No field changes"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {"ball_in_court" in draft && (
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
              Ball in court
              <select
                value={draft.ball_in_court ?? ""}
                disabled={busy}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    ball_in_court: e.target.value ? e.target.value : null,
                  }))
                }
                style={{
                  minHeight: 32,
                  borderRadius: 2,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  padding: "4px 8px",
                }}
              >
                <option value="">Closed / none</option>
                {BIC_CHOICES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {draft.submitted_date !== undefined && (
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
              Submitted
              <input
                type="date"
                value={draft.submitted_date || ""}
                disabled={busy}
                onChange={(e) => setDraft((p) => ({ ...p, submitted_date: e.target.value }))}
                style={{
                  minHeight: 32,
                  borderRadius: 2,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  padding: "4px 8px",
                }}
              />
            </label>
          )}
          {draft.returned_date !== undefined && (
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
              Returned
              <input
                type="date"
                value={draft.returned_date || ""}
                disabled={busy}
                onChange={(e) => setDraft((p) => ({ ...p, returned_date: e.target.value }))}
                style={{
                  minHeight: 32,
                  borderRadius: 2,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  padding: "4px 8px",
                }}
              />
            </label>
          )}
          {draft.approved_date !== undefined && (
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
              Approved
              <input
                type="date"
                value={draft.approved_date || ""}
                disabled={busy}
                onChange={(e) => setDraft((p) => ({ ...p, approved_date: e.target.value }))}
                style={{
                  minHeight: 32,
                  borderRadius: 2,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  padding: "4px 8px",
                }}
              />
            </label>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="sbd-btn-primary"
          disabled={busy}
          onClick={() => void onApply(draft)}
        >
          {busy ? "Applying…" : "Apply suggested"}
        </button>
        <button
          type="button"
          className="sbd-btn-ghost"
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Hide edit" : "Edit"}
        </button>
        <button type="button" className="sbd-btn-ghost" disabled={busy} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
