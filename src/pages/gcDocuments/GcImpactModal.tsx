/**
 * GcImpactModal — record whether an issuance hits steel scope.
 *
 * This is the one place the steel_impact question gets answered, and it is a
 * deliberate, separate act from logging the document. "Not reviewed" is a
 * state, not a default to be clicked past: the modal opens on whatever is
 * stored and requires a positive choice to move off it.
 */

import { useEffect, useState } from "react";
import { Modal, Button } from "./dsPrimitives";
import {
  STEEL_IMPACT_LABELS,
  STEEL_IMPACT_STATES,
  STEEL_IMPACT_TOKENS,
  coerceSteelImpact,
  type SteelImpact,
} from "@/lib/gcDocuments/gcDocTypes";
import type { GcIssuance } from "./gcDocumentsPageDerive";

const HINTS: Record<SteelImpact, string> = {
  unknown: "Nobody has read it yet. This is not a verdict.",
  pending_review: "Being reviewed now — the answer is still open.",
  none: "Read it. Nothing in it changes our scope, quantities or sequence.",
  impacted: "Read it. It changes our scope, quantities, connections or sequence.",
};

export default function GcImpactModal({
  open,
  issuance,
  saving = false,
  onSave,
  onClose,
}: {
  open: boolean;
  issuance: GcIssuance | null;
  saving?: boolean;
  onSave: (impact: SteelImpact, notes: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [impact, setImpact] = useState<SteelImpact>("unknown");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && issuance) {
      setImpact(coerceSteelImpact(issuance.set.steel_impact));
      setNotes(String(issuance.set.impact_notes ?? ""));
      setError(null);
    }
  }, [open, issuance]);

  if (!open || !issuance) return null;

  const handleSave = async () => {
    // A bare "impacts steel" with no note is a dead end for whoever picks this
    // up next — and it is usually the input to an RFI or a change order.
    if (impact === "impacted" && !notes.trim()) {
      setError("Say what it impacts — this is what the RFI or change order gets written from.");
      return;
    }
    setError(null);
    await onSave(impact, notes.trim() || null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={issuance.label}
      title="Steel impact"
      width={560}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {error && (
            <span role="alert" style={{ flex: 1, fontSize: 12, color: "var(--status-error)" }}>
              {error}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>CANCEL</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "SAVING…" : "RECORD"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.55 }}>
          {issuance.set.set_name}
          {issuance.sheets.length > 0 && ` · ${issuance.sheets.length} sheet(s)`}
        </p>

        <div role="radiogroup" aria-label="Steel impact" style={{ display: "grid", gap: 8 }}>
          {STEEL_IMPACT_STATES.map((state) => {
            const selected = impact === state;
            return (
              <button
                key={state}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setImpact(state)}
                style={{
                  display: "grid",
                  gap: 2,
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: selected ? "var(--bg-surface-high)" : "var(--bg-surface-low)",
                  border: `1px solid ${selected ? STEEL_IMPACT_TOKENS[state] : "var(--border-default)"}`,
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: STEEL_IMPACT_TOKENS[state] }}>
                  {STEEL_IMPACT_LABELS[state]}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {HINTS[state]}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="gc-impact-notes"
            style={{
              display: "block", fontSize: 11, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4,
            }}
          >
            What it affects
          </label>
          <textarea
            id="gc-impact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Grid C canopy connections — new embed plates, affects sequence 3."
            style={{
              width: "100%", minHeight: 88, resize: "vertical", padding: "8px 10px",
              borderRadius: 8, border: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)", color: "var(--text-primary)",
              fontSize: 13, outline: "none",
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
