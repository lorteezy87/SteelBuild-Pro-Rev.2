import React, { useMemo, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mono, display, AI_ACCENT } from "./tokens";

/**
 * Picker dialog for Phase 3 revision-delta comparison.
 *
 * Shows the project's completed analyses as two dropdowns — pick a
 * FROM (prior revision) and a TO (current revision), then submit. A new
 * drawing_revision_comparisons row is inserted with status='pending' and
 * the parent page's kick effect fires compareRevisions().
 *
 * Constraints:
 *   - both slots must be set and differ
 *   - only analyses with status='complete' show up so we don't try to
 *     diff a PDF that hasn't been analyzed yet
 */
export default function CompareRevisionsDialog({ open, onClose, projectId, analyses = [], onCreated }) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId,   setToId]   = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  const eligible = useMemo(
    () => analyses
      .filter(a => a.analysis_status === "complete")
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)),
    [analyses],
  );

  if (!open) return null;

  const reset = () => { setFromId(""); setToId(""); setErr(null); };

  const submit = async () => {
    if (!fromId || !toId) { setErr("Pick both revisions."); return; }
    if (fromId === toId)  { setErr("FROM and TO must differ."); return; }
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase
        .from("drawing_revision_comparisons")
        .insert({
          project_id:       projectId,
          from_analysis_id: fromId,
          to_analysis_id:   toId,
          compare_status:   "pending",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      qc.invalidateQueries({ queryKey: ["drawing_revision_comparisons", projectId] });
      toast.success("Comparison queued");
      onCreated?.(data);
      reset();
      onClose();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg);
      toast.error(`Could not queue comparison: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const label = (a) => {
    const bits = [a.drawing_stage || "—"];
    if (a.revision) bits.push(`Rev ${a.revision}`);
    bits.push(new Date(a.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    return `${a.file_name}  ·  ${bits.join(" · ")}`;
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 640, maxWidth: "96vw",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${AI_ACCENT}`,
          borderRadius: 4,
          zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1, ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Compare Two Revisions
          </div>
          <button onClick={onClose} aria-label="Close" style={btnIcon}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {eligible.length < 2 ? (
            <div style={{
              border: "1px dashed var(--border-default)",
              padding: "24px",
              textAlign: "center",
              ...mono, fontSize: 11, color: "var(--text-muted)",
            }}>
              Need at least two completed analyses in this project to compare.
              You have {eligible.length}.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "end" }}>
                <Field label="From (prior revision)">
                  <select style={inputStyle} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                    <option value="">— select —</option>
                    {eligible.map(a => (
                      <option key={a.id} value={a.id}>{label(a)}</option>
                    ))}
                  </select>
                </Field>
                <div style={{ paddingBottom: 8, color: AI_ACCENT }}>
                  <ArrowRight size={18} />
                </div>
                <Field label="To (current revision)">
                  <select style={inputStyle} value={toId} onChange={(e) => setToId(e.target.value)}>
                    <option value="">— select —</option>
                    {eligible.map(a => (
                      <option key={a.id} value={a.id}>{label(a)}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 10, letterSpacing: "0.08em" }}>
                Typically 30–120 seconds. Both PDFs are sent to Claude in one
                message; diffs land in the list below when ready.
              </div>
            </>
          )}

          {err && (
            <div style={{
              marginTop: 14, padding: "8px 12px",
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              color: "var(--status-error)", ...mono, fontSize: 11,
            }}>
              {err}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button onClick={onClose} disabled={busy} style={btnGhost}>CANCEL</button>
          <button
            onClick={submit}
            disabled={busy || eligible.length < 2 || !fromId || !toId}
            style={{ ...btnPrimary, opacity: (busy || eligible.length < 2 || !fromId || !toId) ? 0.5 : 1 }}
          >
            {busy ? "QUEUEING…" : "QUEUE COMPARISON"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px",
  background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12,
  boxSizing: "border-box",
};
const btnPrimary = {
  padding: "8px 24px", background: AI_ACCENT, color: "#000",
  border: "none", borderRadius: 2,
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnGhost = {
  padding: "8px 18px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnIcon = {
  background: "transparent", border: "none",
  color: "var(--text-muted)", cursor: "pointer", padding: 4,
};
