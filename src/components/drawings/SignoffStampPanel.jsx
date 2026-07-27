/**
 * SignoffStampPanel — append-only review stamps for a drawing revision.
 *
 * Migration 072 introduced drawing_signoffs (approved-for-fab,
 * approved-as-noted, revise-and-resubmit, etc.). This panel renders
 * existing stamps as colored chips, opens a detail popover on click,
 * and lets users add a new sign-off via a small modal.
 *
 * V1 records metadata only (stamp_type + notes + stamped_by). V2 will
 * use the geometry columns to drop a stamp on the PDF canvas.
 *
 * Lock-aware: when the drawing's parent set is locked, the "+ Sign Off"
 * action is hidden and a "Locked" footer note is shown. Voiding an
 * existing stamp is also blocked while locked. The DB doesn't enforce
 * the lock; the UI does, plus the service layer for indirect mutations
 * (zones / links / etc.).
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Stamp, AlertCircle, CheckCircle2, FileWarning, Trash2 } from "lucide-react";
import {
  listSignoffs,
  createSignoff,
  voidSignoff,
  SIGNOFF_STAMP_TYPES,
} from "@/lib/drawingHub";

const mono = { fontFamily: "var(--font-mono)" };

// Display config per stamp type. Keep colors close to the existing chip
// palette so the panel reads as part of the viewer rather than a bolt-on.
const STAMP_META = {
  approved_for_fabrication: { label: "Approved for Fab",   color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", Icon: CheckCircle2 },
  approved_as_noted:        { label: "Approved as Noted",  color: "#84cc16", bg: "rgba(132,204,22,0.12)", border: "rgba(132,204,22,0.35)", Icon: CheckCircle2 },
  revise_and_resubmit:      { label: "Revise & Resubmit",  color: "#f59e0b", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.40)", Icon: FileWarning },
  rejected:                 { label: "Rejected",           color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  Icon: AlertCircle },
  reviewed:                 { label: "Reviewed",           color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", Icon: Stamp },
  for_information_only:     { label: "For Info Only",      color: "#6b7280", bg: "rgba(107,114,128,0.12)",border: "rgba(107,114,128,0.35)",Icon: Stamp },
  void:                     { label: "Void",               color: "#71717a", bg: "rgba(113,113,122,0.12)",border: "rgba(113,113,122,0.35)",Icon: Trash2 },
};

const QKEY = (drawingId, revId) => ["signoffs", drawingId, revId];

export default function SignoffStampPanel({
  projectId,
  drawingId,
  drawingRevisionId,
  isLocked = false,
  compact = false,
}) {
  const qc = useQueryClient();
  const [detailFor, setDetailFor] = useState(null); // signoff row or null
  const [creating, setCreating] = useState(false);

  const enabled = !!(projectId && drawingId && drawingRevisionId);

  const { data: signoffs = [], isLoading } = useQuery({
    queryKey: QKEY(drawingId, drawingRevisionId),
    queryFn: () => listSignoffs({ drawingId, drawingRevisionId, includeVoided: false }),
    enabled,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (input) =>
      createSignoff({
        projectId,
        drawingId,
        drawingRevisionId,
        ...input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QKEY(drawingId, drawingRevisionId) });
      setCreating(false);
      toast.success("Sign-off recorded");
    },
    onError: (err) => toast.error(`Sign-off failed: ${err.message}`),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }) => voidSignoff({ id, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QKEY(drawingId, drawingRevisionId) });
      setDetailFor(null);
      toast.success("Sign-off voided");
    },
    onError: (err) => toast.error(`Void failed: ${err.message}`),
  });

  if (!enabled) return null;

  return (
    <div
      className="sbd-card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: compact ? "8px 10px" : "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase" }}>
          Sign-Offs
          {signoffs.length > 0 && (
            <span style={{ marginLeft: 6, color: "var(--text-primary)" }}>· {signoffs.length}</span>
          )}
        </div>
        {!isLocked && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              padding: "4px 8px", borderRadius: 4,
              background: "var(--accent)", border: "none", color: "var(--on-accent)",
              cursor: "pointer", textTransform: "uppercase",
            }}
          >
            + Sign Off
          </button>
        )}
      </div>

      {isLoading && (
        <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
      )}

      {!isLoading && signoffs.length === 0 && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No sign-offs on this revision yet.
        </div>
      )}

      {signoffs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {signoffs.map((s) => {
            const meta = STAMP_META[s.stamp_type] || STAMP_META.reviewed;
            const Icon = meta.Icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setDetailFor(s)}
                title={`${meta.label} · ${s.stamped_by_name || "Unknown"} · ${formatStamp(s.stamped_at)}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 8px", borderRadius: 4,
                  background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                  cursor: "pointer",
                  ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <Icon size={11} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {isLocked && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          Set is locked — sign-offs are read-only.
        </div>
      )}

      {creating && (
        <CreateSignoffModal
          onClose={() => setCreating(false)}
          onSubmit={(input) => createMut.mutate(input)}
          saving={createMut.isPending}
        />
      )}

      {detailFor && (
        <SignoffDetailModal
          signoff={detailFor}
          isLocked={isLocked}
          onClose={() => setDetailFor(null)}
          onVoid={(reason) => voidMut.mutate({ id: detailFor.id, reason })}
          voiding={voidMut.isPending}
        />
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────

function CreateSignoffModal({ onClose, onSubmit, saving }) {
  const [stampType, setStampType] = useState("approved_for_fabrication");
  const [notes, setNotes] = useState("");

  return (
    <ModalShell title="Add Sign-Off" onClose={onClose}>
      <label style={lbl}>Stamp type</label>
      <select
        value={stampType}
        onChange={(e) => setStampType(e.target.value)}
        style={inp}
      >
        {SIGNOFF_STAMP_TYPES.filter((t) => t !== "void").map((t) => (
          <option key={t} value={t}>{STAMP_META[t]?.label || t}</option>
        ))}
      </select>

      <label style={{ ...lbl, marginTop: 10 }}>Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Conditions, exceptions, remarks…"
        style={{ ...inp, resize: "vertical", minHeight: 60 }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button
          onClick={() => onSubmit({ stampType, notes: notes.trim() || null })}
          disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}
        >
          {saving ? "Saving…" : "Stamp"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────

function SignoffDetailModal({ signoff, isLocked, onClose, onVoid, voiding }) {
  const meta = STAMP_META[signoff.stamp_type] || STAMP_META.reviewed;
  const [voidReason, setVoidReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);

  return (
    <ModalShell title={meta.label} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Row label="Stamped by"   value={signoff.stamped_by_name || "—"} />
        <Row label="Stamped at"   value={formatStamp(signoff.stamped_at)} />
        {signoff.notes && <Row label="Notes" value={signoff.notes} multiline />}
      </div>

      {!showVoid && !isLocked && signoff.stamp_type !== "void" && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>Close</button>
          <button onClick={() => setShowVoid(true)} style={{ ...btnGhost, color: "var(--status-error)" }}>
            Void
          </button>
        </div>
      )}

      {showVoid && (
        <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-surface-low)" }}>
          <label style={lbl}>Reason</label>
          <textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            rows={2}
            placeholder="Why is this stamp being voided?"
            style={{ ...inp, resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowVoid(false)} style={btnGhost}>Cancel</button>
            <button
              onClick={() => onVoid(voidReason.trim() || null)}
              disabled={voiding}
              style={{ ...btnPrimary, background: "var(--status-error)", opacity: voiding ? 0.7 : 1 }}
            >
              {voiding ? "Voiding…" : "Confirm Void"}
            </button>
          </div>
        </div>
      )}

      {(isLocked || signoff.stamp_type === "void") && !showVoid && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>
      )}
    </ModalShell>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 420, maxWidth: "90vw",
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {title}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, multiline = false }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 12,
        color: "var(--text-primary)",
        whiteSpace: multiline ? "pre-wrap" : "nowrap",
        overflow: multiline ? "visible" : "hidden",
        textOverflow: multiline ? "clip" : "ellipsis",
      }}>
        {value}
      </div>
    </div>
  );
}

function formatStamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const lbl = {
  ...mono, fontSize: 9, color: "var(--text-muted)",
  letterSpacing: "0.08em", textTransform: "uppercase",
  display: "block", marginBottom: 4,
};

const inp = {
  width: "100%",
  padding: "8px 10px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};

const btnGhost = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  color: "var(--text-muted)",
  borderRadius: 6,
  cursor: "pointer",
  ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const btnPrimary = {
  padding: "8px 16px",
  background: "var(--accent)",
  border: "none",
  color: "var(--on-accent)",
  borderRadius: 6,
  cursor: "pointer",
  ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase",
};
