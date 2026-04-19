import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { mono, display, AI_ACCENT, SEVERITY_COLORS, pill } from "./tokens";

/**
 * Full RFI-authoring dialog that starts from an AI finding.
 *
 * Phase 2: replaces the one-click draft insert. Fields pre-populated from
 * the finding, but the user can edit everything before creating a proper
 * numbered RFI and linking it back via drawing_findings.linked_rfi_id.
 *
 * Plain fixed overlay (NOT Radix Dialog). No <form> tag — explicit button
 * onClick submission.
 */
export default function CreateRfiFromFindingDialog({ open, onClose, finding, analysis, onCreated }) {
  const ref = useRef(null);
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState(() => seed(finding, analysis, today));

  useEffect(() => {
    if (open) {
      setErr(null);
      setForm(seed(finding, analysis, today));
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open, finding, analysis]);

  if (!open) return null;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const severityColor = SEVERITY_COLORS[finding?.severity] || SEVERITY_COLORS.info;

  const submit = async () => {
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!form.question.trim()) {
      setErr("Question / description is required.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      // Get next numbered RFI ID (per-project sequence).
      let rfiNumber = null;
      try {
        rfiNumber = await getNextFormattedNumber({
          projectId: analysis?.project_id,
          recordType: "RFI",
          entityName: "RFI",
          fieldName: "rfi_number",
          prefix: "RFI #",
        });
      } catch {
        // Sequencing failed — the RFI still writes, just without a number.
        rfiNumber = null;
      }

      const payload = {
        project_id:          analysis?.project_id || null,
        rfi_number:          rfiNumber,
        title:               form.title.slice(0, 200),
        question:            form.question.slice(0, 4000),
        description:         form.question.slice(0, 4000),
        drawing_reference:   form.drawing_reference || null,
        spec_section:        form.spec_section || null,
        priority:            form.priority,
        status:              form.status,
        submitted_by:        form.submitted_by || null,
        submitted_date:      form.submitted_date || null,
        date_required:       form.date_required || null,
        assigned_to:         form.assigned_to || null,
        ball_in_court:       form.ball_in_court,
        distribution_list:   form.distribution_list || null,
      };

      const { data: rfi, error: rfiErr } = await supabase
        .from("rfis")
        .insert(payload)
        .select()
        .single();
      if (rfiErr) throw new Error(rfiErr.message);

      const { error: linkErr } = await supabase
        .from("drawing_findings")
        .update({ linked_rfi_id: rfi.id })
        .eq("id", finding.id);
      if (linkErr) throw new Error(linkErr.message);

      qc.invalidateQueries({ queryKey: ["rfis"] });
      qc.invalidateQueries({ queryKey: ["rfis", analysis?.project_id] });
      qc.invalidateQueries({ queryKey: ["drawing_findings", analysis?.id] });
      qc.invalidateQueries({ queryKey: ["drawing_findings_bulk"] });

      toast.success(`${rfi.rfi_number || "RFI"} created`);
      onCreated?.(rfi);
      onClose();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg);
      toast.error(`RFI creation failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }}
      />
      <div
        ref={ref}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 720, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: `1px solid var(--border-default)`,
          borderLeft: `3px solid ${AI_ACCENT}`,
          borderRadius: 4,
          display: "flex", flexDirection: "column",
          zIndex: 1201, outline: "none",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <span style={pill(severityColor)}>{finding?.severity}</span>
          {finding?.sheet_number && (
            <span style={{ ...mono, fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
              {finding.sheet_number}
            </span>
          )}
          <div style={{ flex: 1, ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Create RFI from Finding
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Source context strip */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)", background: "color-mix(in srgb, " + AI_ACCENT + " 5%, transparent)" }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            SOURCE FINDING
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
            {finding?.description}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Field label="Title *" span={3}>
              <input style={inputStyle} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Short RFI subject" />
            </Field>

            <Field label="Question / Description *" span={3}>
              <textarea
                style={{ ...inputStyle, height: 110, resize: "vertical", fontFamily: "var(--font-body)" }}
                value={form.question}
                onChange={(e) => set("question", e.target.value)}
                placeholder="Detailed question for the EOR / GC"
              />
            </Field>

            <Field label="Drawing Ref">
              <input style={inputStyle} value={form.drawing_reference} onChange={(e) => set("drawing_reference", e.target.value)} placeholder="S2.03 / Detail 5" />
            </Field>
            <Field label="Spec Section">
              <input style={inputStyle} value={form.spec_section} onChange={(e) => set("spec_section", e.target.value)} placeholder="05 12 00" />
            </Field>
            <Field label="Priority">
              <select style={inputStyle} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </Field>

            <SectionLabel>Assignment</SectionLabel>

            <Field label="Submitted By (author)">
              <input style={inputStyle} value={form.submitted_by} onChange={(e) => set("submitted_by", e.target.value)} placeholder="Your name or initials" />
            </Field>
            <Field label="Assigned To">
              <input style={inputStyle} value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} placeholder="EOR / GC / architect" />
            </Field>
            <Field label="Ball in Court">
              <select style={inputStyle} value={form.ball_in_court} onChange={(e) => set("ball_in_court", e.target.value)}>
                <option>Contractor</option>
                <option>Architect</option>
                <option>Engineer</option>
                <option>Owner</option>
                <option>Subcontractor</option>
              </select>
            </Field>

            <Field label="Submitted Date">
              <input type="date" style={inputStyle} value={form.submitted_date} onChange={(e) => set("submitted_date", e.target.value)} />
            </Field>
            <Field label="Date Required (answer by)">
              <input type="date" style={inputStyle} value={form.date_required} onChange={(e) => set("date_required", e.target.value)} />
            </Field>
            <Field label="Status">
              <select style={inputStyle} value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option>Draft</option>
                <option>Open</option>
                <option>Submitted</option>
              </select>
            </Field>

            <Field label="Distribution List" span={3}>
              <input
                style={inputStyle}
                value={form.distribution_list}
                onChange={(e) => set("distribution_list", e.target.value)}
                placeholder="Names or emails, comma-separated"
              />
            </Field>
          </div>

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

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0,
        }}>
          <button onClick={onClose} disabled={submitting} style={btnGhost}>
            CANCEL
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              ...btnPrimary,
              opacity: submitting ? 0.6 : 1,
              cursor:  submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "CREATING…" : "CREATE RFI"}
          </button>
        </div>
      </div>
    </>
  );
}

function seed(finding, analysis, today) {
  const title = finding
    ? `[${finding.sheet_number || "Drawing"}] ${finding.description}`.slice(0, 200)
    : "";
  const question = finding
    ? [
        finding.description,
        finding.recommended_action ? `\n\nRecommended action: ${finding.recommended_action}` : "",
        `\n\n— Auto-generated from AI drawing analysis of ${analysis?.file_name || "drawing set"}.`,
      ].join("")
    : "";
  const priority = finding?.severity === "critical" || finding?.severity === "high"
    ? "High"
    : finding?.severity === "low" || finding?.severity === "info"
      ? "Low"
      : "Medium";
  return {
    title,
    question,
    drawing_reference:  finding?.sheet_number || "",
    spec_section:       "",
    priority,
    status:             "Draft",
    submitted_by:       "",
    submitted_date:     today,
    date_required:      "",
    assigned_to:        "",
    ball_in_court:      "Engineer", // findings usually need EOR clarification
    distribution_list:  "",
  };
}

function Field({ label, span = 1, children }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ gridColumn: "span 3", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginTop: 8 }}>
      <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {children}
      </span>
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
  letterSpacing: "0.1em", textTransform: "uppercase",
};
const btnGhost = {
  padding: "8px 18px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
