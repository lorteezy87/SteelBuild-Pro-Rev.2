import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { mono, SEVERITY_COLORS, FINDING_TYPE_LABEL, pill } from "./tokens";

/**
 * Single finding row — severity-coded left border, finding-type pill,
 * description + recommended action, dismiss + "Create RFI" inline
 * controls. "Create RFI" inserts a minimal rfis row + links it back.
 *
 * Phase 2 deepens the RFI-creation flow (author selection, assignment,
 * due date); Phase 1 just records the link.
 */
export default function FindingRow({ finding, analysis, onChanged }) {
  const [busy, setBusy] = useState(false);
  const color = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info;

  const dismiss = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("drawing_findings")
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq("id", finding.id);
      if (error) throw new Error(error.message);
      toast.success("Finding dismissed");
      onChanged?.();
    } catch (e) {
      toast.error(`Dismiss failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const createRfi = async () => {
    if (finding.linked_rfi_id) {
      toast.message("Finding is already linked to an RFI");
      return;
    }
    setBusy(true);
    try {
      const title = `[${finding.sheet_number || "Drawing"}] ${finding.description}`.slice(0, 200);
      const question = [
        finding.description,
        finding.recommended_action ? `\n\nRecommended action: ${finding.recommended_action}` : "",
        `\n\n— Auto-generated from AI drawing analysis of ${analysis?.file_name || "drawing set"}.`,
      ].join("");

      const { data: rfi, error: rfiErr } = await supabase
        .from("rfis")
        .insert({
          project_id:        analysis?.project_id || null,
          title,
          question:          question.slice(0, 4000),
          drawing_reference: finding.sheet_number || null,
          status:            "Draft",
          priority:          finding.severity === "critical" ? "High"
                             : finding.severity === "high"   ? "High"
                             : "Medium",
        })
        .select()
        .single();
      if (rfiErr) throw new Error(rfiErr.message);

      const { error: linkErr } = await supabase
        .from("drawing_findings")
        .update({ linked_rfi_id: rfi.id })
        .eq("id", finding.id);
      if (linkErr) throw new Error(linkErr.message);

      toast.success("RFI draft created");
      onChanged?.();
    } catch (e) {
      toast.error(`RFI creation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: "var(--bg-surface)",
      padding: "10px 14px",
      marginBottom: 8,
      opacity: finding.dismissed ? 0.45 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={pill(color)}>{finding.severity}</span>
          <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
            {FINDING_TYPE_LABEL[finding.finding_type] || finding.finding_type}
          </span>
          {finding.sheet_number && (
            <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>
              {finding.sheet_number}
            </span>
          )}
        </div>
        {finding.linked_rfi_id && (
          <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.12em" }}>
            ↳ RFI LINKED
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.45, marginBottom: 6 }}>
        {finding.description}
      </div>

      {finding.recommended_action && (
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
          <span style={{ color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 700 }}>ACTION · </span>
          {finding.recommended_action}
        </div>
      )}

      {!finding.dismissed && (
        <div style={{ display: "flex", gap: 8 }}>
          {!finding.linked_rfi_id && (
            <button
              onClick={createRfi}
              disabled={busy}
              style={btnGhost}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              CREATE RFI
            </button>
          )}
          <button
            onClick={dismiss}
            disabled={busy}
            style={btnGhost}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            DISMISS
          </button>
        </div>
      )}
    </div>
  );
}

const btnGhost = {
  padding: "4px 10px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
  letterSpacing: "0.14em", textTransform: "uppercase",
  cursor: "pointer",
  transition: "color 120ms",
};
